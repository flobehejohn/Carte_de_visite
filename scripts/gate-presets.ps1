[CmdletBinding()]
param(
  [string]$RepoRoot = "",
  [string]$RunStamp = "",
  [int]$Keep = 3,
  [switch]$Quiet,

  # (optionnel)
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
$category = "gate_presets"

$audit = Resolve-AuditRun -RepoRoot $RepoRoot -OutDir $OutDir -RunStamp $RunStamp -Mode $Mode -Archive:$Archive -Category $category
$RepoRoot = $audit.RepoRoot
Set-Location $RepoRoot

if (-not $PSBoundParameters.ContainsKey("Quiet")) { $Quiet = [bool]$audit.QuietDefault }
if (-not $PSBoundParameters.ContainsKey("Keep")) { $Keep = [int]$audit.KeepDefault }
if ($audit.Mode -eq "ci" -and $Keep -gt 1) { $Keep = 1 }
if ($Quiet) { $VerbosePreference = "SilentlyContinue" }

try {
  if ($audit.LatestOnly -or $Archive) {
    $runDir = $audit.RunDir
  }
  else {
    if ([string]::IsNullOrWhiteSpace($RunStamp)) { $RunStamp = (Get-Date).ToString("yyyyMMdd_HHmmss") }
    $baseDir = Join-Path $audit.OutDir $category
    $runDir = Join-Path $baseDir $RunStamp
    Ensure-Dir $runDir
  }

  $latest = Resolve-OutDirAbs -RepoRoot $RepoRoot -OutDir "$OutDir/_latest/$category" -DefaultSubDir "$OutDir/_latest/$category"
  Ensure-Dir $runDir

  Info $log "Gate presets start"
  Info $log ("Repo root : {0}" -f $RepoRoot)
  Info $log ("Run dir   : {0}" -f $runDir)
  Info $log ("LatestOnly: {0}" -f $audit.LatestOnly)

  $steps = @()
  $steps += Invoke-Step -State $log -Name "tsc strict" -LogPath (Join-Path $runDir "tsc.log") -Quiet:$Quiet -Command {
    npx tsc -p tsconfig.json --noEmit
  }

  $steps += Invoke-Step -State $log -Name "vitest library test" -LogPath (Join-Path $runDir "library.log") -Quiet:$Quiet -Command {
    npx vitest run src/scene/params/ClimatePresets.library.test.ts --reporter dot
  }

  $steps += Invoke-Step -State $log -Name "vitest variants unit" -LogPath (Join-Path $runDir "variants.log") -Quiet:$Quiet -Command {
    npx vitest run src/scene/params/ClimatePresets.variants.unit.test.ts --reporter dot
  }

  $steps += Invoke-Step -State $log -Name "audit presets" -LogPath (Join-Path $runDir "audit-presets.log") -Quiet:$Quiet -Command {
    $out = "$OutDir/_latest/presets"
    if ($Quiet) {
      pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\audit-presets.ps1 -OutDir $out -Quiet
    }
    else {
      pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\audit-presets.ps1 -OutDir $out
    }
  }

  $auditOk = $true
  $latestPresets = Join-Path $audit.OutDir "_latest\presets"
  if (-not (Test-Path $latestPresets)) {
    $auditOk = $false
    Err $log ("Missing audit output: {0}" -f $latestPresets)
  }
  else {
    $jsonCount = @(Get-ChildItem -Path $latestPresets -Filter *.json -File -ErrorAction SilentlyContinue).Count
    $csvCount = @(Get-ChildItem -Path $latestPresets -Filter *.csv  -File -ErrorAction SilentlyContinue).Count
    if ($jsonCount -lt 1 -or $csvCount -lt 1) {
      $auditOk = $false
      Err $log ("Audit outputs missing .json or .csv in {0}" -f $latestPresets)
    }
    else {
      Ok $log ("audit presets latest : {0}" -f $latestPresets)
    }
  }

  $overall = if ($steps | Where-Object { $_.Status -eq "ERR" }) { "ERR" } else { "OK" }
  if (-not $auditOk) { $overall = "ERR" }

  $logPath = Join-Path $runDir "gate-presets.log"
  Write-LogFile -State $log -Path $logPath

  if ($audit.LatestOnly) {
    $latestPath = $runDir
  }
  else {
    $latestPath = Write-AuditLatest -Category $category -RunDir $runDir -LatestDir $latest -Keep $Keep
  }

  if ($overall -eq "OK") {
    Write-Host ("[OK] gate presets => {0}" -f $latestPath) -ForegroundColor Green
    exit 0
  }

  Write-Host ("[KO] gate presets => {0}" -f $latestPath) -ForegroundColor Red
  exit 1
}
catch {
  try {
    if ($runDir -and (Test-Path -LiteralPath $runDir)) {
      $logPath = Join-Path $runDir "gate-presets.uncaught.log"
      Err $log $_.Exception.Message
      Write-LogFile -State $log -Path $logPath
    }
  }
  catch { }

  Write-Host "[KO] gate presets failed" -ForegroundColor Red
  exit 1
}
