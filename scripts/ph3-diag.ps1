[CmdletBinding()]
param(
    [string]$RepoRoot = "C:\ATLAS\INBOX\dev\R_D\carte_de_visite\test_unitaire\app_llmed"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location $RepoRoot

Write-Host "=== ENV ===" -ForegroundColor Cyan
$PSVersionTable.PSVersion
node -v
npm -v

$stamp = (Get-Date).ToString("yyyyMMdd_HHmmss")
$out = Join-Path ".\audit\PH3" $stamp
New-Item -ItemType Directory -Force -Path $out | Out-Null
Write-Host "PH3_OUT=$out" -ForegroundColor Cyan

$f = "src\scene\RitualOrchestrator.js"
if (!(Test-Path $f)) { throw "Fichier introuvable: $f (cwd=$PWD)" }

Write-Host "`n--- applyTargetsToRuntime occurrences" -ForegroundColor Yellow
Select-String -Path $f -Pattern "applyTargetsToRuntime" | Select-Object LineNumber, Line

Write-Host "`n--- safetyFactor / LightSafety / governor occurrences" -ForegroundColor Yellow
Select-String -Path $f -Pattern "safetyFactor|LightSafety|Governor|safeFactor" | Select-Object LineNumber, Line

Write-Host "`n--- climate targets occurrences (fog|bloom|opacity|volume)" -ForegroundColor Yellow
Select-String -Path $f -Pattern "targets|fog|bloom|opacity|volume" | Select-Object LineNumber, Line

Write-Host "`n[OK] PH3 diag done." -ForegroundColor Green
