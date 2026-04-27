param(
  [string]$DistPath = '.\dist',
  [int]$TotalJsRawKbBudget = 1800,
  [int]$LargestJsRawKbBudget = 1600,
  [int]$EntryJsRawKbBudget = 1600,
  [int]$EntryGzipKbBudget = 480,
  [int]$EntryBrotliKbBudget = 440
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function ConvertTo-BytesFromKb {
  param([Parameter(Mandatory = $true)][int]$Kb)
  return $Kb * 1024
}

function Assert-NativeOk {
  param([Parameter(Mandatory = $true)][string]$Step)

  if ($LASTEXITCODE -ne 0) {
    throw "$Step failed with exit code $LASTEXITCODE"
  }
}

function Get-CompressedLength {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][ValidateSet('gzip', 'brotli')][string]$Kind
  )

  Add-Type -AssemblyName System.IO.Compression -ErrorAction SilentlyContinue

  $resolved = Resolve-Path $Path
  $bytes = [System.IO.File]::ReadAllBytes($resolved)
  $outStream = [System.IO.MemoryStream]::new()

  try {
    if ($Kind -eq 'gzip') {
      $stream = [System.IO.Compression.GzipStream]::new(
        $outStream,
        [System.IO.Compression.CompressionLevel]::Optimal,
        $true
      )
    } else {
      $stream = [System.IO.Compression.BrotliStream]::new(
        $outStream,
        [System.IO.Compression.CompressionLevel]::Optimal,
        $true
      )
    }

    try {
      $stream.Write($bytes, 0, $bytes.Length)
    }
    finally {
      $stream.Dispose()
    }

    return [int64]$outStream.Length
  }
  finally {
    $outStream.Dispose()
  }
}

function New-AssetMetric {
  param(
    [Parameter(Mandatory = $true)][System.IO.FileInfo]$File,
    [Parameter(Mandatory = $true)][string]$Root
  )

  $rootPath = (Resolve-Path $Root).Path
  $gzip = Get-CompressedLength -Path $File.FullName -Kind gzip
  $brotli = Get-CompressedLength -Path $File.FullName -Kind brotli

  [PSCustomObject]@{
    Name        = $File.Name
    Relative    = ($File.FullName -replace [regex]::Escape($rootPath), '').TrimStart('\', '/')
    Extension   = $File.Extension
    RawBytes    = [int64]$File.Length
    RawKb       = [Math]::Round($File.Length / 1KB, 2)
    GzipBytes   = [int64]$gzip
    GzipKb      = [Math]::Round($gzip / 1KB, 2)
    BrotliBytes = [int64]$brotli
    BrotliKb    = [Math]::Round($brotli / 1KB, 2)
  }
}

function Get-ViteEntryFile {
  param([Parameter(Mandatory = $true)][string]$Root)

  $manifestCandidates = @(
    (Join-Path $Root '.vite\manifest.json'),
    (Join-Path $Root 'manifest.json')
  )

  $manifestPath = $manifestCandidates |
    Where-Object { Test-Path $_ } |
    Select-Object -First 1

  if (-not $manifestPath) {
    return $null
  }

  $manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json

  foreach ($property in $manifest.PSObject.Properties) {
    $entry = $property.Value
    $propertyNames = @($entry.PSObject.Properties.Name)

    $hasIsEntry = $propertyNames -contains 'isEntry'
    $hasFile = $propertyNames -contains 'file'

    if ($hasIsEntry -and $hasFile -and $entry.isEntry -eq $true -and $entry.file) {
      return [string]$entry.file
    }
  }

  $indexEntry = $manifest.PSObject.Properties |
    Where-Object { $_.Name -eq 'index.html' } |
    Select-Object -First 1

  if ($indexEntry) {
    $entry = $indexEntry.Value
    $propertyNames = @($entry.PSObject.Properties.Name)

    if (($propertyNames -contains 'file') -and $entry.file) {
      return [string]$entry.file
    }
  }

  return $null
}

function Get-SumBytes {
  param(
    [Parameter(Mandatory = $true)][object[]]$Items,
    [Parameter(Mandatory = $true)][string]$Property
  )

  if ($Items.Count -eq 0) {
    return [int64]0
  }

  return [int64](($Items | Measure-Object -Property $Property -Sum).Sum)
}

Write-Host "`n=== Bundle gate ==="

if (-not (Test-Path $DistPath)) {
  throw "Dossier dist introuvable: $DistPath. Lance npm run build avant le gate bundle."
}

$AssetsDir = Join-Path $DistPath 'assets'

if (-not (Test-Path $AssetsDir)) {
  throw "Dossier assets introuvable: $AssetsDir."
}

$assetFiles = Get-ChildItem -Path $AssetsDir -File -Recurse |
  Where-Object { $_.Extension -in @('.js', '.css') }

if (-not $assetFiles) {
  throw "Aucun asset JS/CSS trouvé dans $AssetsDir."
}

$metrics = $assetFiles |
  ForEach-Object { New-AssetMetric -File $_ -Root $DistPath } |
  Sort-Object RawBytes -Descending

$jsAssets = @($metrics | Where-Object { $_.Extension -eq '.js' })
$cssAssets = @($metrics | Where-Object { $_.Extension -eq '.css' })

if ($jsAssets.Count -eq 0) {
  throw "Aucun asset JS trouvé. Gate bundle impossible."
}

$entryRelative = Get-ViteEntryFile -Root $DistPath
$entryMetric = $null

if ($entryRelative) {
  $normalizedEntry = $entryRelative -replace '/', '\'

  $entryMetric = $metrics |
    Where-Object { ($_.Relative -replace '/', '\') -eq $normalizedEntry } |
    Select-Object -First 1
}

if (-not $entryMetric) {
  $entryMetric = $jsAssets |
    Sort-Object RawBytes -Descending |
    Select-Object -First 1

  Write-Host "[WARN] Entry chunk non trouvé via manifest. Fallback sur le plus gros JS: $($entryMetric.Name)"
}

$largestJs = $jsAssets |
  Sort-Object RawBytes -Descending |
  Select-Object -First 1

$totalJsRawBytes = Get-SumBytes -Items $jsAssets -Property RawBytes
$totalCssRawBytes = Get-SumBytes -Items $cssAssets -Property RawBytes
$totalJsGzipBytes = Get-SumBytes -Items $jsAssets -Property GzipBytes
$totalCssGzipBytes = Get-SumBytes -Items $cssAssets -Property GzipBytes
$totalJsBrotliBytes = Get-SumBytes -Items $jsAssets -Property BrotliBytes
$totalCssBrotliBytes = Get-SumBytes -Items $cssAssets -Property BrotliBytes

Write-Host "`n=== Entry chunk ==="
$entryMetric |
  Format-Table Name, RawKb, GzipKb, BrotliKb -AutoSize

Write-Host "`n=== Largest JS chunks ==="
$jsAssets |
  Sort-Object RawBytes -Descending |
  Select-Object -First 10 Name, RawKb, GzipKb, BrotliKb |
  Format-Table -AutoSize

Write-Host "`n=== CSS chunks ==="
$cssAssets |
  Sort-Object RawBytes -Descending |
  Select-Object Name, RawKb, GzipKb, BrotliKb |
  Format-Table -AutoSize

Write-Host "`n=== Totals ==="
[PSCustomObject]@{
  TotalJsRawKb     = [Math]::Round($totalJsRawBytes / 1KB, 2)
  TotalJsGzipKb    = [Math]::Round($totalJsGzipBytes / 1KB, 2)
  TotalJsBrotliKb  = [Math]::Round($totalJsBrotliBytes / 1KB, 2)
  TotalCssRawKb    = [Math]::Round($totalCssRawBytes / 1KB, 2)
  TotalCssGzipKb   = [Math]::Round($totalCssGzipBytes / 1KB, 2)
  TotalCssBrotliKb = [Math]::Round($totalCssBrotliBytes / 1KB, 2)
} | Format-List

$violations = [System.Collections.Generic.List[string]]::new()

if ($totalJsRawBytes -gt (ConvertTo-BytesFromKb $TotalJsRawKbBudget)) {
  $violations.Add("total JS raw $([Math]::Round($totalJsRawBytes / 1KB, 2)) KB > budget $TotalJsRawKbBudget KB")
}

if ($largestJs.RawBytes -gt (ConvertTo-BytesFromKb $LargestJsRawKbBudget)) {
  $violations.Add("largest JS raw $($largestJs.RawKb) KB > budget $LargestJsRawKbBudget KB [$($largestJs.Name)]")
}

if ($entryMetric.RawBytes -gt (ConvertTo-BytesFromKb $EntryJsRawKbBudget)) {
  $violations.Add("entry JS raw $($entryMetric.RawKb) KB > budget $EntryJsRawKbBudget KB [$($entryMetric.Name)]")
}

if ($entryMetric.GzipBytes -gt (ConvertTo-BytesFromKb $EntryGzipKbBudget)) {
  $violations.Add("entry gzip $($entryMetric.GzipKb) KB > budget $EntryGzipKbBudget KB [$($entryMetric.Name)]")
}

if ($entryMetric.BrotliBytes -gt (ConvertTo-BytesFromKb $EntryBrotliKbBudget)) {
  $violations.Add("entry brotli $($entryMetric.BrotliKb) KB > budget $EntryBrotliKbBudget KB [$($entryMetric.Name)]")
}

Write-Host "`n=== Budgets ==="
[PSCustomObject]@{
  TotalJsRawKbBudget  = $TotalJsRawKbBudget
  LargestJsRawKbBudget = $LargestJsRawKbBudget
  EntryJsRawKbBudget  = $EntryJsRawKbBudget
  EntryGzipKbBudget   = $EntryGzipKbBudget
  EntryBrotliKbBudget = $EntryBrotliKbBudget
  EntryChunk          = $entryMetric.Name
  LargestJsChunk      = $largestJs.Name
} | Format-List

if ($violations.Count -gt 0) {
  Write-Host "`n[FAIL] Bundle gate violations:"
  $violations | ForEach-Object { Write-Host " - $_" }
  throw "Bundle gate failed."
}

Write-Host "`n[OK] Bundle gate passed."
