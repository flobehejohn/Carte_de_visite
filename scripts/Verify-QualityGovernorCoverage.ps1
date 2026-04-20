$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Test-FileMarkers {
  param(
    [Parameter(Mandatory = $true)] [string] $Path,
    [Parameter(Mandatory = $true)] [string[]] $Markers
  )

  if (-not (Test-Path $Path)) {
    return [pscustomobject]@{
      Exists = $false
      MissingMarkers = @()
    }
  }

  $content = Get-Content $Path -Raw
  $missing = @()

  foreach ($marker in $Markers) {
    if (-not $content.Contains($marker)) {
      $missing += $marker
    }
  }

  return [pscustomobject]@{
    Exists = $true
    MissingMarkers = $missing
  }
}

$requirements = @(
  @{
    Path = 'src/scene/performance/QualityGovernor.ts'
    Mandatory = $true
    Markers = @('export class QualityGovernor', 'QUALITY_PROFILES')
  },
  @{
    Path = 'src/components/oracle/Oracle3DScene.tsx'
    Mandatory = $true
    Markers = @('safeGetRendererPixelRatio', 'qualityProfiles')
  },
  @{
    Path = 'src/scene/RitualOrchestrator.js'
    Mandatory = $true
    Markers = @('buildQualityProfileTelemetry', 'qualityProfileSource')
  },
  @{
    Path = 'src/scene/modules/orbFluidParticles.js'
    Mandatory = $true
    Markers = @('fluidParticlesState', 'excludeFromComposer')
  },
  @{
    Path = 'src/scene/modules/orbLighting.js'
    Mandatory = $true
    Markers = @('shadowMapSize', 'castShadow')
  },
  @{
    Path = 'src/scene/safety/LightSafetyGovernor.ts'
    Mandatory = $true
    Markers = @('countUsefulShadowCasters', 'cooldownMsLeft')
  },
  @{
    Path = 'src/scene/modules/orbParticles.js'
    Mandatory = $true
    Markers = @('particlesRuntime', 'governedOpacity')
  },
  @{
    Path = 'src/scene/modules/orbVolumes.js'
    Mandatory = $false
    Markers = @('updateVolumeForFrame', 'volumeConfig')
  },
  @{
    Path = 'src/scene/modules/orbTextManager.js'
    Mandatory = $false
    Markers = @('ORB_OVERLAY_RENDER_LAYER', 'applyFocusState')
  },
  @{
    Path = 'src/scene/params/ClimateController.ts'
    Mandatory = $false
    Markers = @('getRuntimeTelemetry', 'getTargets')
  }
)

$results = foreach ($item in $requirements) {
  $markerCheck = Test-FileMarkers -Path $item.Path -Markers $item.Markers

  $gitTouchedNow = $false
  $lastCommit = ''

  try {
    $diffNow = git diff --name-only HEAD -- $item.Path 2>$null
    $gitTouchedNow = ($diffNow | Measure-Object).Count -gt 0

    $lastCommit = (git log -n 1 --format='%h %ad %s' --date=short -- $item.Path 2>$null)
  } catch {
    $lastCommit = ''
  }

  [pscustomobject]@{
    Path = $item.Path
    Mandatory = $item.Mandatory
    Exists = $markerCheck.Exists
    MarkersOk = ($markerCheck.MissingMarkers.Count -eq 0)
    MissingMarkers = ($markerCheck.MissingMarkers -join ' | ')
    TouchedNow = $gitTouchedNow
    LastCommit = $lastCommit
  }
}

$results | Format-Table -AutoSize

$failures = @()

foreach ($row in $results) {
  if ($row.Mandatory -and -not $row.Exists) {
    $failures += "[KO] Fichier manquant : $($row.Path)"
  }
  if ($row.Mandatory -and -not $row.MarkersOk) {
    $failures += "[KO] Marqueurs manquants dans $($row.Path) => $($row.MissingMarkers)"
  }
}

$opacityWrites = Select-String -Path '.\src\scene\modules\orbParticles.js' -Pattern 'material\.opacity\s*=' -AllMatches
if ($opacityWrites) {
  $lines = $opacityWrites | ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line.Trim())" }
  $failures += "[KO] Ecritures interdites sur material.opacity encore présentes dans orbParticles.js`n$($lines -join "`n")"
}

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Host $_ -ForegroundColor Red }
  throw "[KO] Couverture gouverneur qualité incomplète"
}

Write-Host "[OK] Couverture des fichiers de roadmap validée." -ForegroundColor Green
