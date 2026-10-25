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
        [string[]]$Arguments,

        [switch]$AllowFailure
    )

    $command = @(Get-Command -Name $FilePath -CommandType Application -ErrorAction Stop)[0]
    $previousPreference = $ErrorActionPreference
    try {
        # Windows PowerShell turns native stderr into ErrorRecord objects. Judge
        # native failures by exit code, including the expected "manifest unknown".
        $ErrorActionPreference = 'Continue'
        $output = @(& $command.Source @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if (-not $AllowFailure) {
        foreach ($line in $output) { Write-Host $line }
    }
    if ($exitCode -ne 0 -and -not $AllowFailure) {
        throw "$FilePath failed with exit code $exitCode"
    }
    return [pscustomobject]@{ Output = $output; ExitCode = $exitCode }
}

if ($Release -notmatch '^r[0-9]{8}T[0-9]{6}Z-[0-9a-f]{7,8}$') {
    throw "Release must use rYYYYMMDDTHHMMSSZ-<7-to-8 lowercase hex characters>"
}
if ($Registry -match '://' -or $Registry -notmatch '^[a-z0-9][a-z0-9.-]+(?::[0-9]+)?/[a-z0-9][a-z0-9._-]*$') {
    throw "Registry must be a registry host and one namespace without a URL scheme"
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$npmCommand = if ([System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT) { 'npm.cmd' } else { 'npm' }
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
    $dirty = @((Invoke-NativeCommand git @('status', '--porcelain', '--', 'client', 'server', 'deploy/nginx.conf', '.dockerignore')).Output)
    if ($dirty.Count -gt 0) {
        throw "Refusing to publish with uncommitted image inputs:`n$($dirty -join "`n")"
    }

    $sourceRevision = @((Invoke-NativeCommand git @('rev-parse', '--short=8', 'HEAD')).Output)
    if ($sourceRevision.Count -ne 1) {
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
        $inspection = Invoke-NativeCommand docker @('manifest', 'inspect', $image) -AllowFailure
        $inspectOutput = $inspection.Output
        $inspectExitCode = $inspection.ExitCode
        if ($inspectExitCode -eq 0) {
            throw "Refusing to overwrite existing remote tag: $image"
        }
        if (($inspectOutput -join "`n") -notmatch '(?i)manifest unknown|no such manifest|not found') {
            throw "Unable to prove that remote tag is unused: $image"
        }
    }

    Write-Host "==> Running repository quality gates"
    $null = Invoke-NativeCommand -FilePath $npmCommand -Arguments @('--prefix', 'client', 'run', 'check')
    $null = Invoke-NativeCommand -FilePath $npmCommand -Arguments @('--prefix', 'server', 'run', 'check')

    Write-Host "==> Building API image"
    $null = Invoke-NativeCommand docker @('build', '--platform', 'linux/amd64', '--provenance=false', '--sbom=false', '-f', 'server/Dockerfile', '--target', 'runtime', '-t', $images.API_IMAGE, '.')

    Write-Host "==> Building migration image"
    $null = Invoke-NativeCommand docker @('build', '--platform', 'linux/amd64', '--provenance=false', '--sbom=false', '-f', 'server/Dockerfile', '--target', 'migration', '-t', $images.MIGRATION_IMAGE, '.')

    Write-Host "==> Building web image"
    $null = Invoke-NativeCommand docker @('build', '--platform', 'linux/amd64', '--provenance=false', '--sbom=false', '-f', 'client/Dockerfile', '-t', $images.WEB_IMAGE, '.')

    Write-Host "==> Checking images without network access"
    $null = Invoke-NativeCommand docker @('run', '--rm', '--network', 'none', '--entrypoint', 'node', $images.API_IMAGE, '-e', "require('@prisma/client'); require('sharp'); require('fs').accessSync('dist/main.js')")
    $null = Invoke-NativeCommand docker @('run', '--rm', '--network', 'none', '--entrypoint', './node_modules/.bin/prisma', $images.MIGRATION_IMAGE, '--version')

    $digests = [ordered]@{}
    foreach ($entry in $images.GetEnumerator()) {
        Write-Host "==> Pushing $($entry.Value)"
        $pushOutput = (Invoke-NativeCommand docker @('push', $entry.Value)).Output
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
        [System.IO.File]::WriteAllText($temporaryPath, $content, [System.Text.UTF8Encoding]::new($false))
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
