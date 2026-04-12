[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepoRoot {
    try {
        $gitRoot = (git rev-parse --show-toplevel 2>$null)
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($gitRoot)) {
            return (Resolve-Path $gitRoot).Path
        }
    }
    catch {}
    return (Resolve-Path ".").Path
}

$root = Get-RepoRoot
Set-Location $root

$expected = @(
    ".megalinter/presets/_base.yml",
    ".megalinter/presets/00-hygiene.yml",
    ".megalinter/presets/01-src-core.yml",
    ".megalinter/presets/02-delivery.yml",
    ".megalinter/presets/03-styles.yml",
    ".megalinter/presets/04-full.yml",
    ".megalinter/presets/05-ci-blocking.yml",
    ".megalinter/hooks/pre.sh",
    ".megalinter/hooks/post.sh",
    "scripts/ci-megalint.ps1"
)

$missing = @()
foreach ($p in $expected) {
    if (-not (Test-Path -LiteralPath (Join-Path $root $p))) { $missing += $p }
}

if ($missing.Count -gt 0) {
    $missing | ForEach-Object { Write-Host "Missing: $_" -ForegroundColor Red }
    throw "MegaLinter preset system incomplet."
}

Write-Host "[OK] Presets + hooks présents." -ForegroundColor Green
