[CmdletBinding()]
param(
    [string]$RepoRoot = "."
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repo = (Resolve-Path -LiteralPath $RepoRoot).Path
Set-Location $repo

Write-Host "[INFO] E2E via diag/vercel-e2e.ps1"

# charge un secret local non versionné si présent
$localSecret = Join-Path $repo "scripts/diag/secrets.local.ps1"
if (Test-Path -LiteralPath $localSecret) {
    . $localSecret
    Write-Host "[INFO] secrets.local.ps1 loaded"
}

$deploy = ($env:DEPLOY_URL ?? "").Trim()
if (-not $deploy) {
    throw "DEPLOY_URL manquant. Ex: `$env:DEPLOY_URL='https://xxx.vercel.app'`" }

$policy = ($env:E2E_POLICY ?? "block")
$minCit = 2
try { $minCit = [int]($env:E2E_MIN_CITATIONS ?? 2) } catch { $minCit = 2 }

Write-Host "[INFO] DEPLOY_URL=$deploy"
Write-Host "[INFO] Policy=$policy"

pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/diag/vercel-e2e.ps1 `
  -RepoRoot $repo `
  -DeployUrl $deploy `
  -Policy $policy `
  -MinCitations $minCit

exit $LASTEXITCODE
