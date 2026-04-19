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

function Get-VarianceLabel {
  param([double[]]$Values)

  if (-not $Values -or $Values.Count -eq 0) {
    return 'unknown'
  }

  $avg = [double](($Values | Measure-Object -Average).Average)
  $p95 = [double](Get-Percentile -Values $Values -Percentile 95)

  if ($avg -le 0) {
    return 'unknown'
  }

  $ratio = $p95 / $avg

  if ($ratio -le 1.4) { return 'low' }
  if ($ratio -le 2.1) { return 'moderate' }
  return 'high'
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

function To-NullableString {
  param([object]$Value)

  if ($null -eq $Value) { return $null }
  $s = [string]$Value
  if ([string]::IsNullOrWhiteSpace($s)) { return $null }
  return $s
}

function To-DoubleOrZero {
  param([object]$Value)
  if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) {
    return 0.0
  }
  return [double]$Value
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$files = Get-ChildItem -Path $InputRoot -Recurse -File -Filter "perf-quality-*.json"

if (-not $files) {
  throw "Aucun artefact perf-quality-*.json trouvé dans $InputRoot"
}

$runScopedFiles = @($files | Where-Object { $_.FullName -match '[\\/](quality-matrix-run-\d+)[\\/]' })
if ($runScopedFiles.Count -gt 0) {
  $files = $runScopedFiles
}

$rows = foreach ($file in $files) {
  $json = Get-Content $file.FullName -Raw | ConvertFrom-Json

  [PSCustomObject]@{
    Scenario             = [string]$json.scenario
    DeviceKind           = [string]$json.deviceKind
    QualityProfile       = [string]$json.qualityProfile
    ActiveQualityProfile = [string]$json.activeQualityProfile
    ForcedQualityProfile = To-NullableString $json.forcedQualityProfile
    QualityProfileSource = [string]$json.qualityProfileSource
    QualityProfileReason = To-NullableString $json.qualityProfileReason
    Dpr                  = [double]$json.dpr
    DprBucket            = [string]$json.dprBucket
    DeviceClass          = [string]$json.deviceClass
    RendererWidth        = [double]$json.rendererWidth
    RendererHeight       = [double]$json.rendererHeight
    RendererArea         = [double]$json.rendererArea
    RenderMode           = [string]$json.renderMode
    DominantTimingKey    = To-NullableString $json.dominantTimingKey
    DominantTimingMs     = if ($null -eq $json.dominantTimingMs) { $null } else { [double]$json.dominantTimingMs }
    TotalUpdateMs        = [double]$json.orchestratorTimings.totalUpdateMs
    GeometryMs           = [double]$json.orchestratorTimings.geometryMs
    FluidMs              = [double]$json.orchestratorTimings.fluidMs
    VolumeMs             = [double]$json.orchestratorTimings.volumeMs
    MaterialsMs          = [double]$json.orchestratorTimings.materialsMs
    ClimateMs            = To-DoubleOrZero $json.orchestratorTimings.climateMs
    ApplyTargetsMs       = To-DoubleOrZero $json.orchestratorTimings.applyTargetsMs
    MotionMs             = To-DoubleOrZero $json.orchestratorTimings.motionMs
    LightsMs             = To-DoubleOrZero $json.orchestratorTimings.lightsMs
    ParticlesMs          = To-DoubleOrZero $json.orchestratorTimings.particlesMs
    TextMs               = To-DoubleOrZero $json.orchestratorTimings.textMs
    AuditBridgeMs        = To-DoubleOrZero $json.orchestratorTimings.auditBridgeMs
    BootElapsedMs        = [double]$json.bootElapsedMs
    IsWarmup             = [bool]$json.isWarmup
    WarmupPhase          = [string]$json.warmupPhase
    File                 = $file.FullName
  }
}

$matrix = foreach ($scenarioGroup in ($rows | Group-Object Scenario)) {
  $scenarioRows = $scenarioGroup.Group

  $totalValues = @($scenarioRows | ForEach-Object { [double]$_.TotalUpdateMs })
  $metricMap = @{
    geometryMs     = @($scenarioRows | ForEach-Object { [double]$_.GeometryMs })
    fluidMs        = @($scenarioRows | ForEach-Object { [double]$_.FluidMs })
    volumeMs       = @($scenarioRows | ForEach-Object { [double]$_.VolumeMs })
    materialsMs    = @($scenarioRows | ForEach-Object { [double]$_.MaterialsMs })
    climateMs      = @($scenarioRows | ForEach-Object { [double]$_.ClimateMs })
    applyTargetsMs = @($scenarioRows | ForEach-Object { [double]$_.ApplyTargetsMs })
    motionMs       = @($scenarioRows | ForEach-Object { [double]$_.MotionMs })
    lightsMs       = @($scenarioRows | ForEach-Object { [double]$_.LightsMs })
    particlesMs    = @($scenarioRows | ForEach-Object { [double]$_.ParticlesMs })
    textMs         = @($scenarioRows | ForEach-Object { [double]$_.TextMs })
    auditBridgeMs  = @($scenarioRows | ForEach-Object { [double]$_.AuditBridgeMs })
  }

  $metricStats = foreach ($metricName in $metricMap.Keys) {
    $values = @($metricMap[$metricName])
    $avg = [double](($values | Measure-Object -Average).Average)
    $p95 = [double](Get-Percentile -Values $values -Percentile 95)
    $max = [double](($values | Measure-Object -Maximum).Maximum)
    $variance = Get-VarianceLabel -Values $values

    [PSCustomObject]@{
      Metric   = $metricName
      Avg      = [Math]::Round($avg, 3)
      P95      = [Math]::Round($p95, 3)
      Max      = [Math]::Round($max, 3)
      Variance = $variance
    }
  }
  $dominant = $metricStats |
    Sort-Object `
      @{ Expression = 'P95'; Descending = $true }, `
      @{ Expression = 'Avg'; Descending = $true } |
    Select-Object -First 1
  $stableMetrics = @($metricStats | Where-Object { $_.Variance -eq 'low' } | Select-Object -ExpandProperty Metric)

  [PSCustomObject]@{
    scenario               = [string]$scenarioGroup.Name
    device                 = Get-JoinedUnique @($scenarioRows | Select-Object -ExpandProperty DeviceKind)
    dprBucket              = Get-JoinedUnique @($scenarioRows | Select-Object -ExpandProperty DprBucket)
    activeQualityProfile   = Get-JoinedUnique @($scenarioRows | Select-Object -ExpandProperty ActiveQualityProfile)
    forcedQualityProfile   = Get-JoinedUnique @($scenarioRows | Select-Object -ExpandProperty ForcedQualityProfile)
    qualityProfileSource   = Get-JoinedUnique @($scenarioRows | Select-Object -ExpandProperty QualityProfileSource)
    qualityProfileReason   = Get-JoinedUnique @($scenarioRows | Select-Object -ExpandProperty QualityProfileReason)
    deviceClass            = Get-JoinedUnique @($scenarioRows | Select-Object -ExpandProperty DeviceClass)
    renderMode             = Get-JoinedUnique @($scenarioRows | Select-Object -ExpandProperty RenderMode)
    dpr                    = [Math]::Round([double](($scenarioRows | Measure-Object Dpr -Average).Average), 3)
    rendererArea           = [Math]::Round([double](($scenarioRows | Measure-Object RendererArea -Average).Average), 3)
    dominantTimingKey      = [string]$dominant.Metric
    dominantTimingMs_p95   = [double]$dominant.P95
    totalUpdateMs_p95      = [Math]::Round([double](Get-Percentile -Values $totalValues -Percentile 95), 3)
    totalUpdateMs_avg      = [Math]::Round([double](($totalValues | Measure-Object -Average).Average), 3)
    variance               = Get-VarianceLabel -Values $totalValues
    stableMetrics          = @($stableMetrics)
    metricStats            = @($metricStats)
    sampleCount            = $scenarioRows.Count
  }
}

$ts = Get-Date -Format 'yyyyMMdd_HHmmss'
$jsonOut = Join-Path $OutputDir "perf-quality-matrix-summary_$ts.json"
$csvOut  = Join-Path $OutputDir "perf-quality-matrix-summary_$ts.csv"

$payload = [PSCustomObject]@{
  generatedAt = (Get-Date).ToString("o")
  inputRoot   = (Resolve-Path $InputRoot).Path
  files       = @($files.FullName)
  matrix      = @($matrix)
  records     = @($rows)
}

$payload | ConvertTo-Json -Depth 10 | Set-Content -Path $jsonOut -Encoding utf8
$matrix | Export-Csv -Path $csvOut -NoTypeInformation -Encoding utf8

$matrix |
  Select-Object scenario, device, dprBucket, activeQualityProfile, qualityProfileSource, dominantTimingKey, dominantTimingMs_p95, totalUpdateMs_p95, variance |
  Sort-Object scenario |
  Format-Table -AutoSize

Write-Host ""
Write-Host "Résumé JSON : $jsonOut"
Write-Host "Résumé CSV  : $csvOut"