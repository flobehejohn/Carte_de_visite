# scripts/test.ps1
[CmdletBinding()]
param(
  [string]$Filter = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "[test] vitest version:" -ForegroundColor Cyan
npx vitest --version | Out-Host

if ([string]::IsNullOrWhiteSpace($Filter)) {
  Write-Host "[test] vitest run (project scope)..." -ForegroundColor Cyan
  npx vitest run
} else {
  Write-Host "[test] vitest run -t '$Filter'..." -ForegroundColor Cyan
  npx vitest run -t $Filter
}