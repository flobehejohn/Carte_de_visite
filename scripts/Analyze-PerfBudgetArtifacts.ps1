param(
  [string]$InputRoot = ".\test-results",
  [string]$OutputDir = ".\audit\_latest"
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-Percentile {
  param(
    [double[]]$Values,
    [double]$Percentile
  )

  if (-not $Values -or $Values.Count -eq 0) {
    return $null
  }

  $sorted = @($Values | Sort-Object)
  $index = [Math]::Ceiling(($Percentile / 100.0) * $sorted.Count) - 1
  if ($index -lt 0) { $index = 0 }
  if ($index -ge $sorted.Count) { $index = $sorted.Count - 1 }
  return [double]$sorted[$index]
}

function Get-JoinedUnique {
  param([object[]]$Values)

  $clean = @(
    $Values |
      ForEach-Object {
        if ($null -ne $_) {
          $s = [string]$_
          if (-not [string]::IsNullOrWhiteSpace($s)) { $s }
        }
      } |
      Sort-Object -Unique
  )

  if ($clean.Count -eq 0) { return $null }
  return ($clean -join ' | ')
}

function Get-RecommendedThreshold {
  param(
    [string]$Device,
    [double]$P95,
    [double]$Max
  )

  $candidate = [Math]::Max(($P95 * 1.25), ($Max * 1.10))
  if ($Device -eq 'mobile') {
    $candidate = [Math]::Max($candidate, ($P95 * 1.35))
  }

  return [Math]::Ceiling($candidate + 1.0)
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$files = Get-ChildItem -Path $InputRoot -Recurse -File -Filter "perf-budget-*.json"

if (-not $files) {
  throw "Aucun artefact perf-budget-*.json trouvé dans $InputRoot"
}

$runScopedFiles = @($files | Where-Object { $_.FullName -match '[\\/](perf-run-\d+)[\\/]' })
if ($runScopedFiles.Count -gt 0) {
  $files = $runScopedFiles
}

$records = foreach ($file in $files) {
  $json = Get-Content $file.FullName -Raw | ConvertFrom-Json

  foreach ($sample in $json.samples) {
    [PSCustomObject]@{
      File                 = $file.FullName
      Device               = [string]$json.device
      Phase                = [string]$json.phase
      SampleIndex          = [int]$sample.index
      TotalUpdateMs        = [double]$sample.totalUpdateMs
      GeometryMs           = [double]$sample.geometryMs
      FluidMs              = [double]$sample.fluidMs
      VolumeMs             = [double]$sample.volumeMs
      MaterialsMs          = [double]$sample.materialsMs
      DrawCalls            = [double]$sample.drawCalls
      Triangles            = [double]$sample.triangles
      Dpr                  = [double]$sample.dpr
      FramesRendered       = [double]$sample.framesRendered
      RenderMode           = [string]$sample.renderMode
      QualityProfile       = [string]$sample.qualityProfile
      ActiveQualityProfile = [string]$sample.activeQualityProfile
      ForcedQualityProfile = if ($null -eq $sample.forcedQualityProfile -or [string]::IsNullOrWhiteSpace([string]$sample.forcedQualityProfile)) { $null } else { [string]$sample.forcedQualityProfile }
      QualityProfileSource = [string]$sample.qualityProfileSource
      QualityProfileReason = if ($null -eq $sample.qualityProfileReason -or [string]::IsNullOrWhiteSpace([string]$sample.qualityProfileReason)) { $null } else { [string]$sample.qualityProfileReason }
      DprBucket            = [string]$sample.dprBucket
      DeviceClass          = [string]$sample.deviceClass
      RendererArea         = [double]$sample.rendererArea
      DominantTimingKey    = if ($null -eq $sample.dominantTimingKey -or [string]::IsNullOrWhiteSpace([string]$sample.dominantTimingKey)) { $null } else { [string]$sample.dominantTimingKey }
      DominantTimingMs     = if ($null -eq $sample.dominantTimingMs) { $null } else { [double]$sample.dominantTimingMs }
      BootElapsedMs        = [double]$sample.bootElapsedMs
      IsWarmup             = [bool]$sample.isWarmup
      WarmupPhase          = [string]$sample.warmupPhase
      GeometryRecent       = [bool]$sample.recentRebuilds.geometry
      FluidRecent          = [bool]$sample.recentRebuilds.fluid
      MaterialsRecent      = [bool]$sample.recentRebuilds.materials
      CapturedAt           = [string]$sample.capturedAt
    }
  }
}

$metrics = @(
  'TotalUpdateMs',
  'GeometryMs',
  'FluidMs',
  'VolumeMs',
  'MaterialsMs'
)

$summary = @()
foreach ($deviceGroup in ($records | Group-Object Device)) {
  $device = $deviceGroup.Name
  $deviceRows = $deviceGroup.Group

  foreach ($metric in $metrics) {
    $values = @($deviceRows | ForEach-Object { [double]$_.$metric })

    $min = ($values | Measure-Object -Minimum).Minimum
    $max = ($values | Measure-Object -Maximum).Maximum
    $avg = ($values | Measure-Object -Average).Average
    $p95 = Get-Percentile -Values $values -Percentile 95
    $recommended = Get-RecommendedThreshold -Device $device -P95 $p95 -Max $max

    $summary += [PSCustomObject]@{
      Device               = $device
      Metric               = $metric
      SampleCount          = $values.Count
      Min                  = [Math]::Round($min, 3)
      Avg                  = [Math]::Round($avg, 3)
      P95                  = [Math]::Round($p95, 3)
      Max                  = [Math]::Round($max, 3)
      RecommendedThreshold = [Math]::Round($recommended, 3)
    }
  }
}

$metadata = foreach ($deviceGroup in ($records | Group-Object Device)) {
  $deviceRows = $deviceGroup.Group
  [PSCustomObject]@{
    Device          = $deviceGroup.Name
    QualityProfiles = Get-JoinedUnique @($deviceRows | Select-Object -ExpandProperty ActiveQualityProfile)
    ProfileSources  = Get-JoinedUnique @($deviceRows | Select-Object -ExpandProperty QualityProfileSource)
    DprBuckets      = Get-JoinedUnique @($deviceRows | Select-Object -ExpandProperty DprBucket)
    DeviceClasses   = Get-JoinedUnique @($deviceRows | Select-Object -ExpandProperty DeviceClass)
    RenderModes     = Get-JoinedUnique @($deviceRows | Select-Object -ExpandProperty RenderMode)
    RendererAreaMin = [Math]::Round((($deviceRows | Measure-Object RendererArea -Minimum).Minimum), 3)
    RendererAreaMax = [Math]::Round((($deviceRows | Measure-Object RendererArea -Maximum).Maximum), 3)
  }
}

$dominant = foreach ($deviceGroup in ($records | Group-Object Device)) {
  foreach ($dominantGroup in ($deviceGroup.Group | Group-Object DominantTimingKey)) {
    if ([string]::IsNullOrWhiteSpace([string]$dominantGroup.Name)) { continue }

    [PSCustomObject]@{
      Device            = $deviceGroup.Name
      DominantTimingKey = $dominantGroup.Name
      Hits              = $dominantGroup.Count
    }
  }
}

$spikes = foreach ($deviceGroup in ($records | Group-Object Device)) {
  $spike = $deviceGroup.Group | Sort-Object TotalUpdateMs -Descending | Select-Object -First 1

  [PSCustomObject]@{
    Device               = $deviceGroup.Name
    SpikeTotalUpdateMs   = [Math]::Round([double]$spike.TotalUpdateMs, 3)
    GeometryMs           = [Math]::Round([double]$spike.GeometryMs, 3)
    FluidMs              = [Math]::Round([double]$spike.FluidMs, 3)
    VolumeMs             = [Math]::Round([double]$spike.VolumeMs, 3)
    MaterialsMs          = [Math]::Round([double]$spike.MaterialsMs, 3)
    WarmupPhase          = [string]$spike.WarmupPhase
    IsWarmup             = [bool]$spike.IsWarmup
    DominantTimingKey    = [string]$spike.DominantTimingKey
    DominantTimingMs     = if ($null -eq $spike.DominantTimingMs) { $null } else { [Math]::Round([double]$spike.DominantTimingMs, 3) }
    GeometryRecent       = [bool]$spike.GeometryRecent
    FluidRecent          = [bool]$spike.FluidRecent
    MaterialsRecent      = [bool]$spike.MaterialsRecent
    ActiveQualityProfile = [string]$spike.ActiveQualityProfile
    QualityProfileSource = [string]$spike.QualityProfileSource
    DprBucket            = [string]$spike.DprBucket
    RendererArea         = [Math]::Round([double]$spike.RendererArea, 3)
    File                 = [string]$spike.File
  }
}

$ts = Get-Date -Format 'yyyyMMdd_HHmmss'
$jsonOut = Join-Path $OutputDir "perf-budget-summary_$ts.json"
$csvOut  = Join-Path $OutputDir "perf-budget-summary_$ts.csv"
$spikeCsvOut = Join-Path $OutputDir "perf-budget-spikes_$ts.csv"

$payload = [PSCustomObject]@{
  generatedAt = (Get-Date).ToString("o")
  inputRoot   = (Resolve-Path $InputRoot).Path
  files       = @($files.FullName)
  summary     = @($summary)
  metadata    = @($metadata)
  dominant    = @($dominant)
  spikes      = @($spikes)
}

$payload | ConvertTo-Json -Depth 8 | Set-Content -Path $jsonOut -Encoding utf8
$summary | Export-Csv -Path $csvOut -NoTypeInformation -Encoding utf8
$spikes | Export-Csv -Path $spikeCsvOut -NoTypeInformation -Encoding utf8

$summary | Sort-Object Device, Metric | Format-Table -AutoSize
Write-Host ""
$metadata | Sort-Object Device | Format-Table -AutoSize
Write-Host ""
$spikes | Sort-Object Device | Format-Table -AutoSize

Write-Host ""
Write-Host "Résumé JSON : $jsonOut"
Write-Host "Résumé CSV  : $csvOut"
Write-Host "Spikes CSV  : $spikeCsvOut"