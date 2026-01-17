[CmdletBinding()]
param(
  [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$global:LASTEXITCODE = 0
$repoRoot = git rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repoRoot)) {
  throw "Unable to resolve repo root via git rev-parse --show-toplevel"
}
Set-Location $repoRoot

function Run([string]$label, [scriptblock]$command) {
  Write-Host "`n=== $label ===" -ForegroundColor Cyan
  $global:LASTEXITCODE = 0
  & $command
  if ($LASTEXITCODE -ne 0) { throw "$label FAILED (exit=$LASTEXITCODE)" }
}

Run "tsc strict" {
  npx tsc -p tsconfig.json --noEmit
}

Run "vitest mapClimateToRenderParams" {
  npx vitest run src/scene/render/materials/mapClimateToRenderParams.test.ts
}

Run "vitest transparency" {
  npx vitest run src/scene/render/optics/transparency.test.ts
}

Run "vitest applyMaterials integration" {
  npx vitest run src/scene/render/materials/applyMaterials.integration.test.ts
}

Run "audit render params" {
  if ($Quiet) {
    pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\audit-render-params.ps1 -OutDir audit/_latest/render_params -Quiet
  } else {
    pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\audit-render-params.ps1 -OutDir audit/_latest/render_params
  }
}

$latest = Join-Path $repoRoot "audit\_latest\render_params"
if (!(Test-Path $latest)) { throw "Missing audit output: $latest" }

$jsonCount = @(Get-ChildItem -Path $latest -Filter *.json -File).Count
$csvCount  = @(Get-ChildItem -Path $latest -Filter *.csv  -File).Count
if ($jsonCount -lt 1 -or $csvCount -lt 1) {
  throw "Audit outputs missing .json or .csv in $latest"
}

$csvPath = Join-Path $latest "render_params.audit.csv"
if (!(Test-Path $csvPath)) { throw "Missing audit CSV: $csvPath" }
$header = (Get-Content -Path $csvPath -TotalCount 1)
if ($header -notmatch "alphaWire" -or $header -notmatch "alphaParticles" -or $header -notmatch "alphaForeground") {
  throw "Audit CSV header missing alpha fields"
}

Write-Host ("[OK] audit render params latest => {0}" -f $latest) -ForegroundColor Green
Write-Host "`nFULL GREEN" -ForegroundColor Green
