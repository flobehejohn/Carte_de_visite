[CmdletBinding()]
param(
  [string]$RepoRoot = "",
  [string]$RunStamp = "",
  [int]$Keep = 3,
  [switch]$Quiet,

  # (optionnel) pour garder la flexibilité
  [string]$OutDir = ".\audit",
  [string]$Mode = "",
  [switch]$Archive
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ScriptDir "_lib\Log.ps1")
. (Join-Path $ScriptDir "_auditRun.ps1")

$log = New-LogState
$category = "gate_render"

# Politique + repoRoot robustes via Resolve-AuditRun
$audit = Resolve-AuditRun -RepoRoot $RepoRoot -OutDir $OutDir -RunStamp $RunStamp -Mode $Mode -Archive:$Archive -Category $category
$RepoRoot = $audit.RepoRoot
Set-Location $RepoRoot

# Defaults CI auto
if (-not $PSBoundParameters.ContainsKey("Quiet")) { $Quiet = [bool]$audit.QuietDefault }
if (-not $PSBoundParameters.ContainsKey("Keep")) { $Keep = [int]$audit.KeepDefault }
if ($audit.Mode -eq "ci" -and $Keep -gt 1) { $Keep = 1 }
if ($Quiet) { $VerbosePreference = "SilentlyContinue" }

try {
  # Run dir :
  # - CI latest-only => audit/_latest/<category> (déjà cleané par Resolve-AuditRun)
  # - CI -Archive => audit/<category>/VALID_* (par Resolve-AuditRun)
  # - Local => historique timestampé (comme avant)
  if ($audit.LatestOnly -or $Archive) {
    $runDir = $audit.RunDir
  }
  else {
    if ([string]::IsNullOrWhiteSpace($RunStamp)) { $RunStamp = (Get-Date).ToString("yyyyMMdd_HHmmss") }
    $baseDir = Join-Path $audit.OutDir $category
    $runDir = Join-Path $baseDir $RunStamp
    Ensure-Dir $runDir
  }

  # Latest dir central
  $latest = Resolve-OutDirAbs -RepoRoot $RepoRoot -OutDir "$OutDir/_latest/$category" -DefaultSubDir "$OutDir/_latest/$category"
  Ensure-Dir $runDir

  Info $log "Gate render start"
  Info $log ("Repo root : {0}" -f $RepoRoot)
  Info $log ("Run dir   : {0}" -f $runDir)
  Info $log ("LatestOnly: {0}" -f $audit.LatestOnly)

  $steps = @()
  $steps += Invoke-Step -State $log -Name "tsc strict" -LogPath (Join-Path $runDir "tsc.log") -Quiet:$Quiet -Command {
    npx tsc -p tsconfig.json --noEmit
  }

  $steps += Invoke-Step -State $log -Name "vitest mapClimateToRenderParams" -LogPath (Join-Path $runDir "mapClimateToRenderParams.log") -Quiet:$Quiet -Command {
    npx vitest run src/scene/render/materials/mapClimateToRenderParams.test.ts --reporter dot
  }

  $steps += Invoke-Step -State $log -Name "vitest transparency" -LogPath (Join-Path $runDir "transparency.log") -Quiet:$Quiet -Command {
    npx vitest run src/scene/render/optics/transparency.test.ts --reporter dot
  }

  $steps += Invoke-Step -State $log -Name "vitest applyMaterials integration" -LogPath (Join-Path $runDir "applyMaterials.integration.log") -Quiet:$Quiet -Command {
    npx vitest run src/scene/render/materials/applyMaterials.integration.test.ts --reporter dot
  }

  $steps += Invoke-Step -State $log -Name "audit render params" -LogPath (Join-Path $runDir "audit-render-params.log") -Quiet:$Quiet -Command {
    $out = "$OutDir/_latest/render_params"
    if ($Quiet) {
      pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\audit-render-params.ps1 -OutDir $out -Quiet
    }
    else {
      pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\audit-render-params.ps1 -OutDir $out
    }
  }

  # Validate audit outputs (toujours dans audit/_latest/render_params)
  $auditOk = $true
  $latestRender = Join-Path $audit.OutDir "_latest\render_params"
  if (-not (Test-Path $latestRender)) {
    $auditOk = $false
    Err $log ("Missing audit output: {0}" -f $latestRender)
  }
  else {
    $jsonCount = @(Get-ChildItem -Path $latestRender -Filter *.json -File -ErrorAction SilentlyContinue).Count
    $csvCount = @(Get-ChildItem -Path $latestRender -Filter *.csv  -File -ErrorAction SilentlyContinue).Count
    if ($jsonCount -lt 1 -or $csvCount -lt 1) {
      $auditOk = $false
      Err $log ("Audit outputs missing .json or .csv in {0}" -f $latestRender)
    }
    else {
      $csvPath = Join-Path $latestRender "render_params.audit.csv"
      if (-not (Test-Path $csvPath)) {
        $auditOk = $false
        Err $log ("Missing audit CSV: {0}" -f $csvPath)
      }
      else {
        $header = (Get-Content -Path $csvPath -TotalCount 1)
        if ($header -notmatch "alphaWire" -or $header -notmatch "alphaParticles" -or $header -notmatch "alphaForeground") {
          $auditOk = $false
          Err $log "Audit CSV header missing alpha fields"
        }
        else {
          Ok $log ("audit render params latest : {0}" -f $latestRender)
        }
      }
    }
  }

  $overall = if ($steps | Where-Object { $_.Status -eq "ERR" }) { "ERR" } else { "OK" }
  if (-not $auditOk) { $overall = "ERR" }

  $logPath = Join-Path $runDir "gate-render.log"
  Write-LogFile -State $log -Path $logPath

  # ✅ Pas de redondance si LatestOnly: on est déjà dans audit/_latest/<category>
  if ($audit.LatestOnly) {
    $latestPath = $runDir
  }
  else {
    try {
      $latestPath = Write-AuditLatest -Category $category -RunDir $runDir -LatestDir $latest -Keep $Keep
    }
    catch {
      Info $log ("Latest mirror fallback on lock/error: {0}" -f $_.Exception.Message)
      $latestPath = $runDir
      Write-LogFile -State $log -Path $logPath
    }
  }

  if ($overall -eq "OK") {
    Write-Host ("[OK] gate render => {0}" -f $latestPath) -ForegroundColor Green
    exit 0
  }

  Write-Host ("[KO] gate render => {0}" -f $latestPath) -ForegroundColor Red
  exit 1
}
catch {
  try {
    if ($runDir -and (Test-Path -LiteralPath $runDir)) {
      $logPath = Join-Path $runDir "gate-render.uncaught.log"
      Err $log $_.Exception.Message
      Write-LogFile -State $log -Path $logPath
    }
  }
  catch { }

  Write-Host "[KO] gate render failed" -ForegroundColor Red
  exit 1
}
