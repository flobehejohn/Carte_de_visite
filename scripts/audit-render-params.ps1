[CmdletBinding()]
param(
  [string]$RepoRoot = "",
  [string]$OutDir = "audit/_latest/render_params",
  [string]$RunStamp = "",
  [int]$Keep = 3,
  [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ScriptDir "_auditRun.ps1")

if ($Quiet) { $VerbosePreference = "SilentlyContinue" }

if ([string]::IsNullOrWhiteSpace($RepoRoot)) { $RepoRoot = (Get-Location).Path }
$RepoRoot = Resolve-RepoRoot -RepoRoot $RepoRoot -ScriptDir $ScriptDir
Set-Location $RepoRoot

if ([string]::IsNullOrWhiteSpace($RunStamp)) {
  $RunStamp = (Get-Date).ToString("yyyyMMdd_HHmmss")
}

$category = "render_params"
$baseDir = Join-Path $RepoRoot "audit\$category"
$runDir = Join-Path $baseDir $RunStamp
$latest = Resolve-OutDirAbs -RepoRoot $RepoRoot -OutDir $OutDir -DefaultSubDir "audit/_latest/$category"

Ensure-Dir $runDir

if (-not $Quiet) { Write-Host "`n=== audit render params ===" -ForegroundColor Cyan }

$global:LASTEXITCODE = 0
npx tsx .\scripts\audit-render-params.ts $runDir
if ($LASTEXITCODE -ne 0) { throw "audit-render-params.ts failed (exit=$LASTEXITCODE)" }

$latestPath = Write-AuditLatest -Category $category -RunDir $runDir -LatestDir $latest -Keep $Keep

Write-Host ("[OK] audit render params => {0}" -f $latestPath) -ForegroundColor Green
