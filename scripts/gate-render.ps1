[CmdletBinding()]
param(
  [string]$RepoRoot = "",
  [string]$RunStamp = "",
  [int]$Keep = 3,
  [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ScriptDir "_lib\Log.ps1")
. (Join-Path $ScriptDir "_auditRun.ps1")

$log = New-LogState
if (-not $PSBoundParameters.ContainsKey("Quiet")) { $Quiet = $true }
if ($Quiet) { $VerbosePreference = "SilentlyContinue" }

try {
  $RepoRoot = Resolve-RepoRoot -RepoRoot $RepoRoot -ScriptDir $ScriptDir
  Set-Location $RepoRoot

  if ([string]::IsNullOrWhiteSpace($RunStamp)) {
    $RunStamp = (Get-Date).ToString("yyyyMMdd_HHmmss")
  }

  $category = "gate_render"
  $baseDir = Join-Path $RepoRoot "audit\$category"
  $runDir = Join-Path $baseDir $RunStamp
  $latest = Resolve-OutDirAbs -RepoRoot $RepoRoot -OutDir "audit/_latest/$category" -DefaultSubDir "audit/_latest/$category"
  Ensure-Dir $runDir

  Info $log "Gate render start"
  Info $log ("Repo root : {0}" -f $RepoRoot)
  Info $log ("Run dir   : {0}" -f $runDir)

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
    if ($Quiet) {
      pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\audit-render-params.ps1 -OutDir audit/_latest/render_params -Quiet
    }
    else {
      pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\audit-render-params.ps1 -OutDir audit/_latest/render_params
    }
  }

  $auditOk = $true
  $latestRender = Join-Path $RepoRoot "audit\_latest\render_params"
  if (-not (Test-Path $latestRender)) {
    $auditOk = $false
    Err $log ("Missing audit output: {0}" -f $latestRender)
  }
  else {
    $jsonCount = @(Get-ChildItem -Path $latestRender -Filter *.json -File).Count
    $csvCount = @(Get-ChildItem -Path $latestRender -Filter *.csv -File).Count
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

  $latestPath = Write-AuditLatest -Category $category -RunDir $runDir -LatestDir $latest -Keep $Keep

  if ($overall -eq "OK") {
    Write-Host ("[OK] gate render => {0}" -f $latestPath) -ForegroundColor Green
    exit 0
  }

  Write-Host ("[KO] gate render => {0}" -f $latestPath) -ForegroundColor Red
  exit 1
}
catch {
  Err $log $_.Exception.Message
  Write-Host "[KO] gate render failed" -ForegroundColor Red
  exit 1
}
