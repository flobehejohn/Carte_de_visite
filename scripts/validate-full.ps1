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
    [switch]$Quiet,

    # Policies (optionnelles) - utiles pour garder une API stable avec gate.ps1
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

function Get-OverallStatus([object[]]$steps) {
    if ($steps | Where-Object { $_.Status -eq "ERR" }) { return "ERR" }
    if ($steps | Where-Object { $_.Status -eq "WARN" }) { return "WARN" }
    return "OK"
}

function Normalize-Policy([string]$p) {
    if ([string]::IsNullOrWhiteSpace($p)) { return "warn" }
    $v = $p.ToLowerInvariant()
    if ($v -in @("warn", "warning")) { return "warn" }
    if ($v -in @("fail", "block", "strict")) { return "block" }
    return "warn"
}

function Get-PropValue([object]$obj, [string]$name, $default = $null) {
    if ($null -eq $obj) { return $default }
    $p = $obj.PSObject.Properties[$name]
    if ($null -eq $p) { return $default }
    return $p.Value
}

$pushed = $false
$runDir = $null

try {
    $audit = Resolve-AuditRun -RepoRoot $RepoRoot -OutDir $OutDir -RunStamp $RunStamp -Mode $Mode -Archive:$Archive -Prefix "VALID" -CleanLatest:(-not $NoCleanLatest)
    $RepoRoot = $audit.RepoRoot
    $OutDirAbs = $audit.OutDir
    $RunStamp = $audit.RunStamp
    $runDir = $audit.RunDir

    $mainLog = Join-Path $runDir "validate-full.log"
    Set-LogFile -Path $mainLog -Reset

    Info $log "Validation start"
    Info $log ("Repo root : {0}" -f $RepoRoot)
    Info $log ("Run stamp : {0}" -f $RunStamp)
    Info $log ("Run dir   : {0}" -f $runDir)
    Info $log ("Mode      : {0}" -f $audit.Mode)
    Info $log ("Archive   : {0}" -f ([bool]$audit.Archive))
    Info $log ("Strict    : {0}" -f ([bool]$Strict))

    # IMPORTANT: evite collisions sur audit/_latest/*
    $validateRoot = Join-Path $runDir "_validate"
    Ensure-Dir $validateRoot

    $dirs = [ordered]@{
        typecheck     = Join-Path $validateRoot "typecheck"
        tests         = Join-Path $validateRoot "tests"
        knowledge     = Join-Path $validateRoot "knowledge"
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
    $npm = (npm --version) 2>$null
    if ($node) { Info $log ("node : {0}" -f $node.Trim()) } else { Warn $log "node not found in PATH" }
    if ($npm) { Info $log ("npm  : {0}" -f $npm.Trim()) } else { Warn $log "npm not found in PATH" }

    $auditRuntime = Join-Path $ScriptDir "audit-runtime.ps1"
    $auditOpacity = Join-Path $ScriptDir "audit-opacity.ps1"
    $auditSinks = Join-Path $ScriptDir "audit-opacity-sinks.ps1"
    $gateKnowledge = Join-Path $ScriptDir "gate-knowledge.ps1"
    $knowledgeSmoke = Join-Path $ScriptDir "diag\knowledge-smoke.ps1"

    $policyValue = Normalize-Policy $AuditPolicy

    $steps = @()

    $steps += Invoke-Step -State $log -Name "typecheck" -LogPath (Join-Path $dirs.typecheck "typecheck.log") -Quiet:$Quiet -Command {
        npm run -s typecheck
    }

    $junitPath = Join-Path $dirs.tests "junit.xml"
    $steps += Invoke-Step -State $log -Name "tests" -LogPath (Join-Path $dirs.tests "tests.log") -Quiet:$Quiet -Command {
        npx --no-install vitest run --reporter default --reporter junit --outputFile $junitPath
    }

    $steps += Invoke-Step -State $log -Name "gate-knowledge" -WarnExitCodes @(2) -LogPath (Join-Path $dirs.knowledge "gate-knowledge.log") -Quiet:$Quiet -Command {
        pwsh -NoProfile -ExecutionPolicy Bypass -File $gateKnowledge `
            -RepoRoot $RepoRoot -OutDir $OutDirAbs -RunStamp $RunStamp -Mode $audit.Mode -Policy $policyValue -Quiet:$Quiet
    }

    $steps += Invoke-Step -State $log -Name "knowledge-smoke" -WarnExitCodes @(2) -LogPath (Join-Path $dirs.knowledge "knowledge-smoke.log") -Quiet:$Quiet -Command {
        pwsh -NoProfile -ExecutionPolicy Bypass -File $knowledgeSmoke `
            -RepoRoot $RepoRoot -RunStamp $RunStamp -Mode $audit.Mode -Policy $policyValue -Quiet:$Quiet
    }

    $steps += Invoke-Step -State $log -Name "build" -LogPath (Join-Path $dirs.build "build.log") -Quiet:$Quiet -Command {
        npm run build
    }

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

    $knowledgeWarnOnly = $false
    try {
        $warnSteps = $steps | Where-Object { $_.Status -eq "WARN" }
        if ($warnSteps -and $warnSteps.Count -gt 0) {
            $nonKnowledge = $warnSteps | Where-Object { $_.Name -notin @("gate-knowledge", "knowledge-smoke") }
            if (-not $nonKnowledge -or $nonKnowledge.Count -eq 0) {
                if ($policyValue -eq "warn") { $knowledgeWarnOnly = $true }
            }
        }
    }
    catch {}

    # Lire metrics knowledge-smoke depuis le runDir courant
    $knowledgeMetrics = $null
    try {
        $knowledgePath = Join-Path $runDir ("knowledge_smoke_{0}.json" -f $RunStamp)
        if (Test-Path -LiteralPath $knowledgePath) {
            $knowledgeMetrics = Get-Content -LiteralPath $knowledgePath -Raw -Encoding UTF8 | ConvertFrom-Json
        }
    }
    catch {}

    Info $log "Summary"
    foreach ($s in $steps) {
        $sec = [Math]::Round(($s.DurationMs / 1000), 2)
        $msg = ("{0,-22} {1,6}s exit={2}" -f $s.Name, $sec, $s.ExitCode)
        if ($s.Status -eq "OK") { Ok $log $msg }
        elseif ($s.Status -eq "WARN") { Warn $log $msg }
        else { Err $log $msg }
    }

    if ($overall -eq "OK") { Ok $log "RESULT OK" }
    elseif ($overall -eq "WARN" -and $Strict -and -not $knowledgeWarnOnly) { Warn $log "RESULT WARN (strict=on, exit=1)" }
    elseif ($overall -eq "WARN" -and $Strict -and $knowledgeWarnOnly) { Warn $log "RESULT WARN (knowledge policy warn, exit=0)" }
    elseif ($overall -eq "WARN") { Warn $log "RESULT WARN" }
    else { Err $log "RESULT ERR" }

    $summaryTxt = Join-Path $runDir "summary.txt"
    $summaryJson = Join-Path $runDir "summary.json"

    $summaryLines = New-Object System.Collections.Generic.List[string]
    $summaryLines.Add(("runStamp: {0}" -f $RunStamp)) | Out-Null
    $summaryLines.Add(("repoRoot: {0}" -f $RepoRoot)) | Out-Null
    $summaryLines.Add(("outDir  : {0}" -f $OutDirAbs)) | Out-Null
    $summaryLines.Add(("mode    : {0}" -f $audit.Mode)) | Out-Null
    $summaryLines.Add(("archive : {0}" -f ([bool]$audit.Archive))) | Out-Null
    $summaryLines.Add(("strict  : {0}" -f ([bool]$Strict))) | Out-Null
    $summaryLines.Add(("overall : {0}" -f $overall)) | Out-Null

    $km = Get-PropValue $knowledgeMetrics "metrics" $null
    if ($km) {
        $summaryLines.Add(("knowledge.corpus_size : {0}" -f (Get-PropValue $km "corpus_size" ""))) | Out-Null
        $summaryLines.Add(("knowledge.corpus_hash : {0}" -f (Get-PropValue $km "corpus_hash" ""))) | Out-Null
        $summaryLines.Add(("knowledge.retriever_version : {0}" -f (Get-PropValue $km "retriever_version" ""))) | Out-Null
        $summaryLines.Add(("knowledge.citations_min : {0}" -f (Get-PropValue $km "citations_min" ""))) | Out-Null
        $summaryLines.Add(("knowledge.citations_avg : {0}" -f (Get-PropValue $km "citations_avg" ""))) | Out-Null
        $summaryLines.Add(("knowledge.empty_rate : {0}" -f (Get-PropValue $km "knowledge_empty_rate" ""))) | Out-Null
    }

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
    if ($km) { $payload.knowledge = $km }

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
    if ($overall -eq "WARN" -and $Strict -and $knowledgeWarnOnly) { exit 0 }
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
