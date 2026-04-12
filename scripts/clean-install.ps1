# scripts/clean-install.ps1
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "[clean] Stop node/vite/rollup..." -ForegroundColor Cyan
Get-Process node,vite,rollup -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "[clean] Remove node_modules..." -ForegroundColor Cyan
if (Test-Path .\node_modules) {
  try {
    npx --yes rimraf node_modules
  } catch {
    Write-Host "[clean] rimraf failed, fallback rmdir..." -ForegroundColor Yellow
    cmd /c rmdir /s /q node_modules
  }
}

Write-Host "[clean] npm cache verify..." -ForegroundColor Cyan
npm cache verify | Out-Host

Write-Host "[clean] npm ci..." -ForegroundColor Cyan
npm ci | Out-Host

Write-Host "[clean] done." -ForegroundColor Green