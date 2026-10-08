# Explicit public-asset fetch using the host's proxy-aware HTTP transport.
$ErrorActionPreference = 'Stop'
$assetRoot = Split-Path -Parent $PSScriptRoot
$deck = Get-Content -LiteralPath (Join-Path $assetRoot 'shared/tarot/deck.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$folder = Join-Path $assetRoot 'client/public/tarot'
$headers = @{ 'User-Agent' = 'BookSoul-public-assets/1.0' }
$sources = @()
for ($start = 0; $start -lt $deck.Count; $start += 20) {
  $batch = @($deck | Select-Object -Skip $start -First 20)
  $titles = [Uri]::EscapeDataString(($batch.sourceTitle -join '|'))
  $metadata = Invoke-RestMethod -Uri "https://commons.wikimedia.org/w/api.php?action=query&titles=$titles&prop=imageinfo&iiprop=url%7Cextmetadata&iilimit=1&format=json" -Headers $headers -TimeoutSec 30
  $pages = @($metadata.query.pages.PSObject.Properties.Value)
  foreach ($card in $batch) {
    $page = $pages | Where-Object { $_.title -eq $card.sourceTitle }
    $info = $page.imageinfo[0]
    if ($info.extmetadata.LicenseShortName.value -ne 'Public domain') { throw "Unverified license: $($card.id)" }
    $assetUrl = [UriBuilder]$info.url
    if ($assetUrl.Scheme -ne 'https' -or $assetUrl.Host -ne 'upload.wikimedia.org') { throw 'Unexpected source host' }
    $assetUrl.Query = ''
    $target = Join-Path $folder $card.image
    if (-not (Test-Path -LiteralPath $target)) {
      for ($attempt = 0; $attempt -lt 4; $attempt++) {
        try { Invoke-WebRequest -Uri $assetUrl.Uri -Headers $headers -OutFile $target -TimeoutSec 30; break }
        catch {
          $status = [int]$_.Exception.Response.StatusCode
          if ($status -notin @(429, 502, 503, 504) -or $attempt -eq 3) { throw }
          Start-Sleep -Seconds (5 * [Math]::Pow(2, $attempt))
        }
      }
      Start-Sleep -Seconds 2
    }
    $sources += [ordered]@{ id=$card.id; file=$card.image; page=$info.descriptionurl; original=$assetUrl.Uri.AbsoluteUri; license='Public domain'; artist='Pamela Colman Smith'; categories=$info.extmetadata.Categories.value }
    Write-Output "Downloaded $($sources.Count)/78"
  }
}
$sources | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $folder 'sources.json') -Encoding UTF8
