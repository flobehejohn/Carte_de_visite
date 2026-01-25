[CmdletBinding()]
param(
    [string]$RepoRoot = ".",
    [string]$OutBase = "audit/lint-analytics",
    [string]$FamilyMapPath = "scripts/lint/lint.families.json",
    [string[]]$Targets = @("src/**/*.{ts,tsx,js,jsx}"),
    [switch]$FixDryRun,
    [switch]$WithImportGraph
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Ensure-Dir([string]$p) {
    if (-not (Test-Path -LiteralPath $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
    (Resolve-Path -LiteralPath $p).Path
}

Import-Module (Join-Path $PSScriptRoot "LintAnalytics.psm1") -Force -DisableNameChecking

$repo = (Resolve-Path -LiteralPath $RepoRoot).Path
$stamp = New-LintStamp
$outDir = Ensure-Dir (Join-Path $repo (Join-Path $OutBase $stamp))

Write-Host "[INFO] RepoRoot: $repo" -ForegroundColor Gray
Write-Host "[INFO] RunDir  : $outDir" -ForegroundColor Gray
Write-Host "[INFO] Targets : $($Targets -join ', ')" -ForegroundColor Gray
Write-Host "[INFO] FixDryRun: $([bool]$FixDryRun)" -ForegroundColor Gray
Write-Host "[INFO] ImportGraph: $([bool]$WithImportGraph)" -ForegroundColor Gray
Write-Host "[INFO] FamilyMap: $FamilyMapPath" -ForegroundColor Gray

try {
    $res = Invoke-LintAnalytics `
        -RepoRoot $repo `
        -OutDir $outDir `
        -FamilyMapPath $FamilyMapPath `
        -Targets $Targets `
        -FixDryRun:$FixDryRun `
        -WithImportGraph:$WithImportGraph

    $latestFile = Join-Path $repo (Join-Path $OutBase "_latest.txt")
    Set-Content -LiteralPath $latestFile -Value $outDir -Encoding UTF8

    Write-Host "[OK] lint-analytics terminé" -ForegroundColor Green
    Write-Host ("[OK] eslintExit={0} graphTool={1} nodes={2} edges={3}" -f $res.EslintExit, $res.GraphTool, $res.GraphNodes, $res.GraphEdges) -ForegroundColor Gray
    Write-Host ("[OK] report: {0}" -f (Join-Path $outDir "report.html")) -ForegroundColor Cyan
    exit 0
}
catch {
    $errPath = Join-Path $outDir "_tool_error.txt"
    $msg = @(
        "lint-analytics tool crashed",
        ("Message: {0}" -f $_.Exception.Message),
        "",
        "InvocationInfo:",
        ($_.InvocationInfo.PositionMessage),
        "",
        "Full exception:",
        ($_.Exception.ToString())
    ) -join [Environment]::NewLine

    Set-Content -LiteralPath $errPath -Value $msg -Encoding UTF8
    Write-Host ("[ERR] lint-analytics tool crashed: {0}" -f $_.Exception.Message) -ForegroundColor Red
    Write-Host ("[ERR] details: {0}" -f $errPath) -ForegroundColor Yellow
    exit 2
}
