[CmdletBinding()]
param(
    [string]$RepoRoot = "",
    [string]$OutDir = ".\audit\lint-analytics",
    [switch]$FixDryRun,
    [switch]$WithImportGraph
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Ensure-Dir([string]$p) {
    if (-not (Test-Path -LiteralPath $p)) { New-Item -ItemType Directory -Force -Path $p | Out-Null }
    (Resolve-Path -LiteralPath $p).Path
}

function Detect-RepoRoot {
    if (-not [string]::IsNullOrWhiteSpace($RepoRoot)) {
        return (Resolve-Path -LiteralPath $RepoRoot).Path
    }
    try {
        $top = (& git rev-parse --show-toplevel) 2>$null
        if ($LASTEXITCODE -eq 0 -and $top) { return (Resolve-Path -LiteralPath $top.Trim()).Path }
    }
    catch {}
    return (Resolve-Path -LiteralPath ".").Path
}

$repo = Detect-RepoRoot
$stamp = "LINT_{0:yyyyMMdd_HHmmss}" -f (Get-Date)
$out = Ensure-Dir (Join-Path (Ensure-Dir $OutDir) $stamp)
$log = Join-Path $out "_run.log"

try {
    $modulePath = Join-Path $repo "scripts\lint\LintAnalytics.psm1"
    Import-Module $modulePath -Force

    $res = Invoke-LintAnalytics `
        -RepoRoot $repo `
        -OutDir $out `
        -FixDryRun:$FixDryRun `
        -WithImportGraph:$WithImportGraph

    "[OK] outDir=$($res.outDir)" | Tee-Object -FilePath $log -Append | Out-Null
    exit 0
}
catch {
    "[ERR] audit-lint crash: $($_.Exception.Message)" | Tee-Object -FilePath $log -Append | Out-Null
    throw
}
