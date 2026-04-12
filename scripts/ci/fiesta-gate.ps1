param(
    [ValidateSet("local", "ci")]
    [string]$Mode = "local",

    [string]$RepoRoot = "",
    [string]$RunStamp = "",
    [int]$InstallTimeoutSec = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$audit = Join-Path $ScriptDir "fiesta-audit.ps1"

if ($Mode -eq "ci") {
    pwsh -NoProfile -ExecutionPolicy Bypass -File $audit @(
        "-RepoRoot", $RepoRoot,
        "-RunStamp", $RunStamp,
        "-Mode", "ci",
        "-DirtyPolicy", "fail",
        "-LintPolicy", "warn",
        "-TestPolicy", "fail",
        "-BuildPolicy", "fail",
        "-AuditPolicy", "fail",
        "-InstallTimeoutSec", $InstallTimeoutSec
    )
    exit $LASTEXITCODE
}

pwsh -NoProfile -ExecutionPolicy Bypass -File $audit @(
    "-RepoRoot", $RepoRoot,
    "-RunStamp", $RunStamp,
    "-Mode", "local",
    "-DirtyPolicy", "warn",
    "-LintPolicy", "warn",
    "-TestPolicy", "warn",
    "-BuildPolicy", "warn",
    "-AuditPolicy", "warn",
    "-InstallTimeoutSec", $InstallTimeoutSec
)
exit $LASTEXITCODE
