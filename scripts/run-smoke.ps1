[CmdletBinding()]
param(
    [string]$RepoRoot = "",
    [string]$OutDir = ".\audit",
    [string]$RunStamp = "",
    [switch]$Archive,
    [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-RepoRoot([string]$RepoRoot, [string]$ScriptDir) {
    if (-not [string]::IsNullOrWhiteSpace($RepoRoot)) {
        return (Resolve-Path -LiteralPath $RepoRoot -ErrorAction Stop).Path
    }
    return (Resolve-Path -LiteralPath (Join-Path $ScriptDir "..") -ErrorAction Stop).Path
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-RepoRoot $RepoRoot $ScriptDir
Set-Location $root

if ([string]::IsNullOrWhiteSpace($RunStamp)) {
    $RunStamp = "P0_{0:yyyyMMdd_HHmmss}" -f (Get-Date)
}

# Smoke = rapide : archive optionnel (OFF par défaut)
if (-not $PSBoundParameters.ContainsKey("Archive")) { $Archive = $false }
if (-not $PSBoundParameters.ContainsKey("Quiet")) { $Quiet = $true }

$gate = Join-Path $root "scripts\gate.ps1"
$verify = Join-Path $root "scripts\verify\verify-analytics-contract.ps1"

Write-Host "[INFO] Phase 0 smoke" -ForegroundColor Cyan
Write-Host ("[INFO] RepoRoot : {0}" -f $root)
Write-Host ("[INFO] RunStamp : {0}" -f $RunStamp)
Write-Host ("[INFO] Archive  : {0}" -f ([bool]$Archive))

# Phase 0 defaults (figés)
$dirtyPolicy = "warn"
$lintPolicy = "warn"
$auditPolicy = "warn"

& pwsh -NoProfile -ExecutionPolicy Bypass -File $gate `
    -RepoRoot $root -OutDir $OutDir -RunStamp $RunStamp -Mode local `
    -Archive:$Archive -Quiet:$Quiet `
    -DirtyPolicy $dirtyPolicy -LintPolicy $lintPolicy -AuditPolicy $auditPolicy

$gateExit = $LASTEXITCODE
if ($gateExit -ne 0) {
    Write-Host ("[ERR] gate failed (exit={0})" -f $gateExit) -ForegroundColor Red
    exit $gateExit
}

# Contract check après gate : Phase 0 => warn => exit 0 même si contrat cassé
if (Test-Path -LiteralPath $verify) {
    & pwsh -NoProfile -ExecutionPolicy Bypass -File $verify -RepoRoot $root -Policy warn -Quiet:$Quiet
    # ne bloque pas le pipeline en phase 0
    exit 0
}

Write-Host "[WARN] verify-analytics-contract.ps1 manquant (skipped)" -ForegroundColor Yellow
exit 0
