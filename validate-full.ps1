[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$RepoRoot = "",

    [string]$OutDir = ".\\audit",
    [string]$RunStamp = "",
    [switch]$Strict,
    [string]$Mode = "",
    [switch]$Archive,
    [switch]$NoCleanLatest
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$scriptPath = Join-Path $PSScriptRoot "scripts\\validate-full.ps1"
if (-not (Test-Path $scriptPath)) {
    throw "Missing script: $scriptPath"
}

& pwsh -NoProfile -ExecutionPolicy Bypass -File $scriptPath -RepoRoot $RepoRoot -OutDir $OutDir -RunStamp $RunStamp -Strict:$Strict -Mode $Mode -Archive:$Archive -NoCleanLatest:$NoCleanLatest
exit $LASTEXITCODE
