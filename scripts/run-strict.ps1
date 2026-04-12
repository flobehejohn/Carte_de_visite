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
    $RunStamp = "P1_{0:yyyyMMdd_HHmmss}" -f (Get-Date)
}

if (-not $PSBoundParameters.ContainsKey("Archive")) { $Archive = $true }
if (-not $PSBoundParameters.ContainsKey("Quiet")) { $Quiet = $true }

$gate = Join-Path $root "scripts\gate.ps1"
$verify = Join-Path $root "scripts\verify\verify-analytics-contract.ps1"

Write-Host "[INFO] Phase 1 strict" -ForegroundColor Magenta
Write-Host ("[INFO] RepoRoot : {0}" -f $root)
Write-Host ("[INFO] RunStamp : {0}" -f $RunStamp)

# Exemple Phase 1 : policies FAIL + -Strict (tu pourras ajuster plus tard)
$dirtyPolicy = "fail"
$lintPolicy = "fail"
$auditPolicy = "fail"

& pwsh -NoProfile -ExecutionPolicy Bypass -File $gate `
    -RepoRoot $root -OutDir $OutDir -RunStamp $RunStamp -Mode local `
    -Archive:$Archive -Quiet:$Quiet `
    -Strict `
    -DirtyPolicy $dirtyPolicy -LintPolicy $lintPolicy -AuditPolicy $auditPolicy

$gateExit = $LASTEXITCODE

# Contract check strict : policy fail (bloquant)
if (Test-Path -LiteralPath $verify) {
    & pwsh -NoProfile -ExecutionPolicy Bypass -File $verify -RepoRoot $root -Policy fail -Quiet:$Quiet
    $contractExit = $LASTEXITCODE
    if ($gateExit -ne 0) { exit $gateExit }
    exit $contractExit
}

exit $gateExit
