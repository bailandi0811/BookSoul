param(
    [Parameter(Mandatory = $true)]
    [string]$Release,

    [Parameter(Mandatory = $true)]
    [string]$Registry,

    [string]$OutputDirectory = ".superpowers/releases"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,

        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $output = @(& $FilePath @Arguments 2>&1)
    $exitCode = $LASTEXITCODE
    foreach ($line in $output) { Write-Host $line }
    if ($exitCode -ne 0) {
        throw "$FilePath failed with exit code $exitCode"
    }
    return $output
}

if ($Release -notmatch '^r[0-9]{8}T[0-9]{6}Z-[0-9a-f]{7,8}$') {
    throw "Release must use rYYYYMMDDTHHMMSSZ-<7-to-8 lowercase hex characters>"
}
if ($Registry -match '://' -or $Registry -notmatch '^[a-z0-9][a-z0-9.-]+(?::[0-9]+)?/[a-z0-9][a-z0-9._-]*$') {
    throw "Registry must be a registry host and one namespace without a URL scheme"
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$lockDirectory = Join-Path $repositoryRoot '.superpowers'
New-Item -ItemType Directory -Path $lockDirectory -Force | Out-Null
$lockPath = Join-Path $lockDirectory 'publish-acr.lock'
try {
    $publishLock = [System.IO.File]::Open(
        $lockPath,
        [System.IO.FileMode]::OpenOrCreate,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None
    )
} catch {
    throw "Another BookSoul ACR publish is already running from this checkout"
}

Push-Location $repositoryRoot
try {
    $dirty = @(& git status --porcelain -- client server deploy/nginx.conf .dockerignore 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "git status failed with exit code $LASTEXITCODE" }
    if ($dirty.Count -gt 0) {
        throw "Refusing to publish with uncommitted image inputs:`n$($dirty -join "`n")"
    }

    $sourceRevision = @(& git rev-parse --short=8 HEAD 2>&1)
    if ($LASTEXITCODE -ne 0 -or $sourceRevision.Count -ne 1) {
        throw "Unable to determine the source revision"
    }
    $releaseRevision = $Release.Substring($Release.LastIndexOf('-') + 1)
    if (-not $sourceRevision[0].StartsWith($releaseRevision)) {
        throw "Release revision $releaseRevision does not match HEAD $($sourceRevision[0])"
    }

    $images = [ordered]@{
        API_IMAGE       = "${Registry}/booksoul-api:${Release}"
        MIGRATION_IMAGE = "${Registry}/booksoul-migration:${Release}"
        WEB_IMAGE       = "${Registry}/booksoul-web:${Release}"
    }

    $null = Invoke-NativeCommand docker @('info')
    foreach ($image in $images.Values) {
        $inspectOutput = @(& docker manifest inspect $image 2>&1)
        $inspectExitCode = $LASTEXITCODE
        if ($inspectExitCode -eq 0) {
            throw "Refusing to overwrite existing remote tag: $image"
        }
        if (($inspectOutput -join "`n") -notmatch '(?i)manifest unknown|no such manifest|not found') {
            throw "Unable to prove that remote tag is unused: $image"
        }
    }

    Write-Host "==> Running repository quality gates"
    $null = Invoke-NativeCommand npm @('--prefix', 'client', 'run', 'check')
    $null = Invoke-NativeCommand npm @('--prefix', 'server', 'run', 'check')

    Write-Host "==> Building API image"
    $null = Invoke-NativeCommand docker @('build', '--platform', 'linux/amd64', '-f', 'server/Dockerfile', '--target', 'runtime', '-t', $images.API_IMAGE, '.')

    Write-Host "==> Building migration image"
    $null = Invoke-NativeCommand docker @('build', '--platform', 'linux/amd64', '-f', 'server/Dockerfile', '--target', 'migration', '-t', $images.MIGRATION_IMAGE, '.')

    Write-Host "==> Building web image"
    $null = Invoke-NativeCommand docker @('build', '--platform', 'linux/amd64', '-f', 'client/Dockerfile', '-t', $images.WEB_IMAGE, '.')

    Write-Host "==> Checking images without network access"
    $null = Invoke-NativeCommand docker @('run', '--rm', '--network', 'none', '--entrypoint', 'node', $images.API_IMAGE, '-e', "require('@prisma/client'); require('sharp'); require('fs').accessSync('dist/main.js')")
    $null = Invoke-NativeCommand docker @('run', '--rm', '--network', 'none', '--entrypoint', './node_modules/.bin/prisma', $images.MIGRATION_IMAGE, '--version')

    $digests = [ordered]@{}
    foreach ($entry in $images.GetEnumerator()) {
        Write-Host "==> Pushing $($entry.Value)"
        $pushOutput = Invoke-NativeCommand docker @('push', $entry.Value)
        $digestMatch = [regex]::Match(($pushOutput -join "`n"), 'digest:\s*(sha256:[0-9a-f]{64})')
        if (-not $digestMatch.Success) {
            throw "docker push did not report a digest for $($entry.Value)"
        }
        $repository = $entry.Value.Substring(0, $entry.Value.LastIndexOf(':'))
        $digests[$entry.Key] = "${repository}@$($digestMatch.Groups[1].Value)"
    }

    $resolvedOutput = if ([System.IO.Path]::IsPathRooted($OutputDirectory)) {
        [System.IO.Path]::GetFullPath($OutputDirectory)
    } else {
        [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $OutputDirectory))
    }
    $manifestPath = Join-Path $resolvedOutput "${Release}.env"
    if (Test-Path -LiteralPath $manifestPath) {
        throw "Release manifest already exists: $manifestPath"
    }
    New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null
    $temporaryPath = "${manifestPath}.tmp-${PID}"
    try {
        $content = @(
            "# Release: $Release"
            "# Source revision: $sourceRevision"
            "WEB_IMAGE=$($digests.WEB_IMAGE)"
            "API_IMAGE=$($digests.API_IMAGE)"
            "MIGRATION_IMAGE=$($digests.MIGRATION_IMAGE)"
        ) -join "`n"
        Set-Content -LiteralPath $temporaryPath -Value $content -Encoding utf8NoBOM -NoNewline
        Move-Item -LiteralPath $temporaryPath -Destination $manifestPath
    } finally {
        if (Test-Path -LiteralPath $temporaryPath) {
            Remove-Item -LiteralPath $temporaryPath -Force
        }
    }

    Write-Host "Published $Release"
    Write-Host "Image coordinates: $manifestPath"
    Write-Host "Copy the three digest-pinned image values into a complete server release env before deployment."
} finally {
    Pop-Location
    $publishLock.Dispose()
}
