[CmdletBinding()]
param([string]$RepoRoot = "")

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepoRoot([string]$hint) {
  if ($hint -and (Test-Path -LiteralPath $hint)) { return (Resolve-Path -LiteralPath $hint).Path }
  return (git rev-parse --show-toplevel)
}

$root = Get-RepoRoot $RepoRoot
Set-Location $root

$expected = @(
  ".mega-linter.yml",
  ".megalinter/presets/00-hygiene.yml",
  ".megalinter/presets/01-src-core.yml",
  ".megalinter/presets/02-delivery.yml",
  ".megalinter/presets/03-styles.yml",
  ".megalinter/presets/04-full.yml",
  "scripts/ci-megalint.ps1",
  "scripts/lint/clean-megalinter.ps1",
  "scripts/lint/verify-megalinter-presets.ps1",
  ".eslintrc.cjs",
  "stylelint.config.cjs",
  ".stylelintignore",
  "cspell.json",
  ".jscpd.json"
)

$missing = @()
foreach ($p in $expected) {
  $full = Join-Path $root $p
  if (-not (Test-Path -LiteralPath $full)) { $missing += $p }
}

Write-Host "Total attendu: $($expected.Count)"
Write-Host "Manquants:     $($missing.Count)"
if ($missing.Count -gt 0) {
  $missing | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
  throw "Preset system incomplet."
}

# Vérifs minimales de cohérence
$presets = Get-ChildItem -LiteralPath (Join-Path $root ".megalinter/presets") -Filter "*.yml" | Sort-Object Name
foreach ($f in $presets) {
  $t = Get-Content -LiteralPath $f.FullName -Raw
  foreach ($k in @("DISABLE_ERRORS", "REPORT_OUTPUT_FOLDER")) {
    if ($t -notmatch "(?m)^\s*$k\s*:") { throw "Preset $($f.Name) : clé manquante: $k" }
  }
}

Write-Host "[OK] Presets présents + cohérents." -ForegroundColor Green