[CmdletBinding()]
param(
  [string]$HostIp = '127.0.0.1',

  [ValidateRange(1, 65535)]
  [int]$Port = 3000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -ge 7) {
  $PSNativeCommandUseErrorActionPreference = $true
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$packageJson = Join-Path $repoRoot 'package.json'

if (-not (Test-Path $packageJson)) {
  throw "package.json introuvable à la racine du repo : $packageJson"
}

$env:GEMINI_FAIL_CLOSED_STRICT = '1'
$env:GEMINI_STRUCTURED_OUTPUTS = '1'
$env:CONTRACT_GUARD = '1'
$env:GEMINI_JSON_RETRY_MAX = '1'
$env:GEMINI_ALLOW_JSON_REPAIR = '0'

Write-Host "[dev] Starting vercel dev on http://$HostIp`:$Port" -ForegroundColor Cyan

Push-Location $repoRoot
try {
  & npx --yes vercel@latest dev --listen "$HostIp`:$Port"

  if ($LASTEXITCODE -ne 0) {
    throw "vercel dev a échoué avec le code $LASTEXITCODE"
  }
}
finally {
  Pop-Location
}
