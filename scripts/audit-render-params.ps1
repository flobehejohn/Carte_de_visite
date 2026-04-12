# scripts/audit-render-params.ps1
[CmdletBinding()]
param(
  [string]$RepoRoot = "",
  [string]$OutDir = "audit/_latest/render_params",
  [string]$RunStamp = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) { $RepoRoot = (Get-Location).Path }
Set-Location $RepoRoot

if ([string]::IsNullOrWhiteSpace($RunStamp)) {
  $RunStamp = (Get-Date).ToString("yyyyMMdd_HHmmss")
}

$baseDir = Join-Path $RepoRoot "audit\\render_params"
$runDir = Join-Path $baseDir $RunStamp
$latest = Join-Path $RepoRoot $OutDir

New-Item -ItemType Directory -Force -Path $baseDir | Out-Null
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

$global:LASTEXITCODE = 0
npx tsx .\scripts\audit-render-params.ts $runDir
if ($LASTEXITCODE -ne 0) { throw "audit-render-params.ts failed (exit=$LASTEXITCODE)" }

if (Test-Path $latest) {
  Remove-Item -Recurse -Force $latest
}
New-Item -ItemType Directory -Force -Path (Split-Path $latest -Parent) | Out-Null
Copy-Item -Recurse -Force $runDir $latest

Write-Host "[OK] audit render params => $latest" -ForegroundColor Green
