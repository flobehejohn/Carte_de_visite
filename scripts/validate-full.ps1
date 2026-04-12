[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$RepoRoot = "",

    [string]$OutDir = ".\audit",
    [string]$RunStamp = "",
    [switch]$Strict,
    [string]$Mode = "",
    [switch]$Archive,
    [switch]$NoCleanLatest,
    [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ScriptDir "_lib\Log.ps1")
. (Join-Path $ScriptDir "_auditRun.ps1")

$log = New-LogState
if (-not $PSBoundParameters.ContainsKey("Quiet")) { $Quiet = $true }
if ($Quiet) { $VerbosePreference = "SilentlyContinue" }

function Get-OverallStatus([object[]]$steps) {
    if ($steps | Where-Object { $_.Status -eq "ERR" }) { return "ERR" }
    if ($steps | Where-Object { $_.Status -eq "WARN" }) { return "WARN" }
    return "OK"
}

$pushed = $false
$runDir = $null

try {
    $audit = Resolve-AuditRun -RepoRoot $RepoRoot -OutDir $OutDir -RunStamp $RunStamp -Mode $Mode -Archive:$Archive -Prefix "VALID" -CleanLatest:(-not $NoCleanLatest)
    $RepoRoot  = $audit.RepoRoot
    $OutDirAbs = $audit.OutDir
    $RunStamp  = $audit.RunStamp
    $runDir    = $audit.RunDir

    $mainLog = Join-Path $runDir "validate-full.log"
    Set-LogFile -Path $mainLog -Reset

    Info $log "Validation start"
    Info $log ("Repo root : {0}" -f $RepoRoot)
    Info $log ("Run stamp : {0}" -f $RunStamp)
    Info $log ("Run dir   : {0}" -f $runDir)
    Info $log ("Mode      : {0}" -f $audit.Mode)
    Info $log ("Archive   : {0}" -f ([bool]$audit.Archive))
    Info $log ("Strict    : {0}" -f ([bool]$Strict))

    # IMPORTANT:
    # En mode local, runDir = audit\_latest.
    # Or, les scripts d'audit écrasent audit\_latest\runtime / opacity / opacity_sinks via Write-AuditLatest.
    # Donc: on met TOUTES les sorties "validate-full" dans un sous-dossier _validate
    # pour éviter toute collision/lock.
    $validateRoot = Join-Path $runDir "_validate"
    Ensure-Dir $validateRoot

    $dirs = [ordered]@{
        typecheck     = Join-Path $validateRoot "typecheck"
        tests         = Join-Path $validateRoot "tests"
        build         = Join-Path $validateRoot "build"
        runtime       = Join-Path $validateRoot "runtime"
        opacity       = Join-Path $validateRoot "opacity"
        opacity_sinks = Join-Path $validateRoot "opacity_sinks"
        e2e           = Join-Path $validateRoot "e2e"
        gate          = Join-Path $validateRoot "gate"
    }
    foreach ($d in $dirs.Values) { Ensure-Dir $d }

    Push-Location $RepoRoot
    $pushed = $true

    $node = (node --version) 2>$null
    $npm  = (npm --version) 2>$null
    if ($node) { Info $log ("node : {0}" -f $node.Trim()) } else { Warn $log "node not found in PATH" }
    if ($npm)  { Info $log ("npm  : {0}" -f $npm.Trim()) } else { Warn $log "npm not found in PATH" }

    $auditRuntime = Join-Path $ScriptDir "audit-runtime.ps1"
    $auditOpacity = Join-Path $ScriptDir "audit-opacity.ps1"
    $auditSinks   = Join-Path $ScriptDir "audit-opacity-sinks.ps1"

    $steps = @()

    $steps += Invoke-Step -State $log -Name "typecheck" -LogPath (Join-Path $dirs.typecheck "typecheck.log") -Quiet:$Quiet -Command {
        npm run -s typecheck
    }

    $junitPath = Join-Path $dirs.tests "junit.xml"
    $steps += Invoke-Step -State $log -Name "tests" -LogPath (Join-Path $dirs.tests "tests.log") -Quiet:$Quiet -Command {
        npx --no-install vitest run --reporter default --reporter junit --outputFile $junitPath
    }

    $steps += Invoke-Step -State $log -Name "build" -LogPath (Join-Path $dirs.build "build.log") -Quiet:$Quiet -Command {
        npm run build
    }

    # Les audits écrivent leur "latest" dans audit/_latest/<category> via -OutDir.
    # On garde ça, mais les logs validate-full (Invoke-Step) sont dans runDir/_validate/... => plus de lock.
    $steps += Invoke-Step -State $log -Name "audit-runtime" -WarnExitCodes @(2) -LogPath (Join-Path $dirs.runtime "audit-runtime.step.log") -Quiet:$Quiet -Command {
        pwsh -NoProfile -ExecutionPolicy Bypass -File $auditRuntime -RepoRoot $RepoRoot -OutDir "audit/_latest/runtime" -RunStamp $RunStamp -Quiet:$Quiet
    }

    $steps += Invoke-Step -State $log -Name "audit-opacity" -WarnExitCodes @(2) -LogPath (Join-Path $dirs.opacity "audit-opacity.step.log") -Quiet:$Quiet -Command {
        pwsh -NoProfile -ExecutionPolicy Bypass -File $auditOpacity -RepoRoot $RepoRoot -OutDir "audit/_latest/opacity" -RunStamp $RunStamp -Quiet:$Quiet
    }

    $steps += Invoke-Step -State $log -Name "audit-opacity-sinks" -WarnExitCodes @(2) -LogPath (Join-Path $dirs.opacity_sinks "audit-opacity-sinks.step.log") -Quiet:$Quiet -Command {
        pwsh -NoProfile -ExecutionPolicy Bypass -File $auditSinks -RepoRoot $RepoRoot -OutDir "audit/_latest/opacity_sinks" -RunStamp $RunStamp -Quiet:$Quiet
    }

    $overall = Get-OverallStatus $steps

    Info $log "Summary"
    foreach ($s in $steps) {
        $sec = [Math]::Round(($s.DurationMs / 1000), 2)
        $msg = ("{0,-22} {1,6}s exit={2}" -f $s.Name, $sec, $s.ExitCode)
        if ($s.Status -eq "OK") { Ok $log $msg }
        elseif ($s.Status -eq "WARN") { Warn $log $msg }
        else { Err $log $msg }
    }

    if ($overall -eq "OK") { Ok $log "RESULT OK" }
    elseif ($overall -eq "WARN" -and $Strict) { Warn $log "RESULT WARN (strict=on, exit=1)" }
    elseif ($overall -eq "WARN") { Warn $log "RESULT WARN" }
    else { Err $log "RESULT ERR" }

    $summaryTxt  = Join-Path $runDir "summary.txt"
    $summaryJson = Join-Path $runDir "summary.json"

    $summaryLines = New-Object System.Collections.Generic.List[string]
    $summaryLines.Add(("runStamp: {0}" -f $RunStamp)) | Out-Null
    $summaryLines.Add(("repoRoot: {0}" -f $RepoRoot)) | Out-Null
    $summaryLines.Add(("outDir  : {0}" -f $OutDirAbs)) | Out-Null
    $summaryLines.Add(("mode    : {0}" -f $audit.Mode)) | Out-Null
    $summaryLines.Add(("archive : {0}" -f ([bool]$audit.Archive))) | Out-Null
    $summaryLines.Add(("strict  : {0}" -f ([bool]$Strict))) | Out-Null
    $summaryLines.Add(("overall : {0}" -f $overall)) | Out-Null
    foreach ($s in $steps) {
        $sec = [Math]::Round(($s.DurationMs / 1000), 2)
        $summaryLines.Add(("{0} {1} {2}s exit={3} log={4}" -f $s.Status, $s.Name, $sec, $s.ExitCode, $s.LogPath)) | Out-Null
    }
    Set-Content -LiteralPath $summaryTxt -Value ($summaryLines -join "`r`n") -Encoding UTF8

    $payload = [ordered]@{
        timestamp = (Get-Date).ToString("o")
        runStamp  = $RunStamp
        repoRoot  = $RepoRoot
        outDir    = $OutDirAbs
        runDir    = $runDir
        mode      = $audit.Mode
        archive   = [bool]$audit.Archive
        strict    = [bool]$Strict
        overall   = $overall
        warnCount = $log.WarnCount
        errCount  = $log.ErrCount
        steps     = $steps
        logs      = $mainLog
    }
    ($payload | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $summaryJson -Encoding UTF8

    Write-AuditManifest -Path $audit.Manifest -Payload @{
        timestamp = $audit.Timestamp
        runStamp  = $RunStamp
        repoRoot  = $RepoRoot
        outDir    = $OutDirAbs
        runDir    = $runDir
        mode      = $audit.Mode
        archive   = [bool]$audit.Archive
        git       = $audit.Git
        steps     = $steps
        overall   = $overall
        warnCount = $log.WarnCount
        errCount  = $log.ErrCount
    }

    $latestPath = Join-Path $audit.BaseDir "latest.txt"
    Set-Content -LiteralPath $latestPath -Value $runDir -Encoding UTF8
    Ok $log ("latest : {0}" -f $runDir)

    if ($overall -eq "OK") { exit 0 }
    if ($overall -eq "WARN" -and -not $Strict) { exit 0 }
    exit 1
}
catch {
    Err $log $_.Exception.Message
    if ($runDir) {
        try { Write-LogFile -State $log -Path (Join-Path $runDir "validate-full.error.log") } catch {}
    }
    exit 1
}
finally {
    if ($pushed) { Pop-Location }
}
