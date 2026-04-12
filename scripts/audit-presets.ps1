# scripts/audit-presets.ps1
[CmdletBinding()]
param(
  [string]$RepoRoot = "",
  [string]$OutDir = "audit/_latest/presets",
  [string]$RunStamp = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) { $RepoRoot = (Get-Location).Path }
Set-Location $RepoRoot

if ([string]::IsNullOrWhiteSpace($RunStamp)) {
  $RunStamp = (Get-Date).ToString("yyyyMMdd_HHmmss")
}

$baseDir = Join-Path $RepoRoot "audit\presets"
$runDir  = Join-Path $baseDir $RunStamp
$latest  = Join-Path $RepoRoot $OutDir

New-Item -ItemType Directory -Force -Path $baseDir | Out-Null
New-Item -ItemType Directory -Force -Path $runDir  | Out-Null

# 1) Genere dans runDir
$global:LASTEXITCODE = 0
npx tsx .\scripts\audit-presets.ts $runDir
if ($LASTEXITCODE -ne 0) { throw "audit-presets.ts failed (exit=$LASTEXITCODE)" }

# 2) Rafraichit _latest (on remplace le dossier)
if (Test-Path $latest) {
  Remove-Item -Recurse -Force $latest
}
New-Item -ItemType Directory -Force -Path (Split-Path $latest -Parent) | Out-Null
Copy-Item -Recurse -Force $runDir $latest

Write-Host "[OK] audit presets => $latest" -ForegroundColor Green
