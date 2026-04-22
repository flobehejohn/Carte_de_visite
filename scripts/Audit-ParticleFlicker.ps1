param(
  [string]$BaseUrl = 'http://127.0.0.1:4173'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Repo

pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\Trace-Audit-ParticleFlicker.ps1 -BaseUrl $BaseUrl
