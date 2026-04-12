[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$RepoRoot = "",

    [string]$OutDir = ".\audit",
    [string]$RunStamp = "",
    [string]$Mode = "",
    [switch]$Archive,
    [switch]$NoCleanLatest,
    [switch]$Quiet,
    [switch]$Strict,
    [string]$DirtyPolicy = "",
    [string]$LintPolicy = "",
    [string]$AuditPolicy = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ScriptDir "_lib\Log.ps1")
. (Join-Path $ScriptDir "_auditRun.ps1")

$log = New-LogState
if (-not $PSBoundParameters.ContainsKey("Quiet")) { $Quiet = $true }
if ($Quiet) { $VerbosePreference = "SilentlyContinue" }
if (-not $PSBoundParameters.ContainsKey("Strict")) { $Strict = $true }

$runDir = $null
$tempLog = $null

try {
    $audit = Resolve-AuditRun -RepoRoot $RepoRoot -OutDir $OutDir -RunStamp $RunStamp -Mode $Mode -Archive:$Archive -Prefix "VALID" -CleanLatest:$false
    $RepoRoot = $audit.RepoRoot
    $OutDirAbs = $audit.OutDir
    $RunStamp = $audit.RunStamp
    $runDir = $audit.RunDir

    Info $log "Gate start (strict)"
    Info $log ("Repo root : {0}" -f $RepoRoot)
    Info $log ("Run stamp : {0}" -f $RunStamp)
    Info $log ("Run dir   : {0}" -f $runDir)
    Info $log ("Mode      : {0}" -f $audit.Mode)
    Info $log ("Archive   : {0}" -f ([bool]$audit.Archive))

    $validateScript = Join-Path $ScriptDir "validate-full.ps1"
    $tempLog = Join-Path $env:TEMP ("validate-full_{0}.log" -f ([guid]::NewGuid().ToString("N")))

    $step = Invoke-Step -State $log -Name "validate-full" -LogPath $tempLog -Quiet:$Quiet -Command {
        pwsh -NoProfile -ExecutionPolicy Bypass -File $validateScript `
          -RepoRoot $RepoRoot -OutDir $OutDirAbs -RunStamp $RunStamp `
          -Strict:$Strict -Mode $audit.Mode -Archive:$audit.Archive -NoCleanLatest:$NoCleanLatest -Quiet:$Quiet `
          -DirtyPolicy $DirtyPolicy -LintPolicy $LintPolicy -AuditPolicy $AuditPolicy
    }

    $gateDir = Join-Path $runDir "gate"
    Ensure-Dir $gateDir

    $validateLog = Join-Path $gateDir "validate-full.log"
    if ($tempLog -and (Test-Path -LiteralPath $tempLog)) {
        Move-Item -Force -LiteralPath $tempLog -Destination $validateLog
    }

    $gateLog = Join-Path $gateDir "gate.log"
    Write-LogFile -State $log -Path $gateLog

    if ($step.ExitCode -eq 0) { Ok $log "Gate OK" }
    else { Err $log ("Gate FAILED (exit={0})" -f $step.ExitCode) }

    $summaryPath = Join-Path $gateDir "gate-summary.txt"
    $summary = @(
        ("runStamp: {0}" -f $RunStamp),
        ("repoRoot: {0}" -f $RepoRoot),
        ("outDir  : {0}" -f $OutDirAbs),
        ("result  : {0}" -f ($(if ($step.ExitCode -eq 0) { "OK" } else { "ERR" }))),
        ("exit    : {0}" -f $step.ExitCode),
        ("validateSummary: {0}" -f (Join-Path $runDir "summary.txt")),
        ("validateLog    : {0}" -f $validateLog)
    )
    Set-Content -LiteralPath $summaryPath -Value ($summary -join "`r`n") -Encoding UTF8

    $validateSummary = Join-Path $runDir "summary.txt"
    if (Test-Path -LiteralPath $validateSummary) {
        Info $log "Validate summary:"
        Get-Content -LiteralPath $validateSummary | ForEach-Object { Info $log $_ }
    }

    $latestPath = Join-Path $audit.BaseDir "latest.txt"
    Set-Content -LiteralPath $latestPath -Value $runDir -Encoding UTF8
    Ok $log ("latest : {0}" -f $runDir)

    if ($step.ExitCode -eq 0) { exit 0 }
    exit 1
}
catch {
    Err $log $_.Exception.Message
    if ($runDir) {
        try { Write-LogFile -State $log -Path (Join-Path $runDir "gate.error.log") } catch {}
    }
    exit 1
}
finally {
    if ($tempLog -and (Test-Path -LiteralPath $tempLog)) {
        try { Remove-Item -Force -LiteralPath $tempLog } catch {}
    }
}
