[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$RepoRoot = "",

    [string]$OutDir = ".\audit",

    [Alias('Stamp')]
    [string]$RunStamp = "",

    [string]$Mode = "",
    [string]$Policy = "warn",
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

function Normalize-Policy([string]$p) {
    if ([string]::IsNullOrWhiteSpace($p)) { return "warn" }
    $v = $p.ToLowerInvariant()
    if ($v -in @("warn", "warning")) { return "warn" }
    if ($v -in @("fail", "block", "strict")) { return "block" }
    return "warn"
}

$pushed = $false
try {
    $audit = Resolve-AuditRun -RepoRoot $RepoRoot -OutDir $OutDir -RunStamp $RunStamp -Mode $Mode -Prefix "KNOW" -CleanLatest:$false
    $RepoRoot = $audit.RepoRoot
    $RunStamp = $audit.RunStamp
    $runDir = $audit.RunDir

    $policyValue = Normalize-Policy $Policy
    $isBlock = ($policyValue -eq "block")

    Info $log "gate-knowledge start"
    Info $log ("Repo root : {0}" -f $RepoRoot)
    Info $log ("Run stamp : {0}" -f $RunStamp)
    Info $log ("Run dir   : {0}" -f $runDir)
    Info $log ("Policy    : {0}" -f $policyValue)

    Push-Location $RepoRoot
    $pushed = $true

    $testLog = Join-Path $runDir ("gate_knowledge_{0}.log" -f $RunStamp)
    $step = Invoke-Step -State $log -Name "gate-knowledge" -LogPath $testLog -Quiet:$Quiet -Command {
        npx --no-install vitest run src/server/knowledge/knowledgeIntegrity.test.ts
    }

    $exitCode = if ($step.ExitCode -eq 0) { 0 } elseif ($isBlock) { 1 } else { 2 }
    if ($exitCode -eq 0) { Ok $log "Gate knowledge OK" }
    elseif ($exitCode -eq 2) { Warn $log "Gate knowledge WARN (policy=warn)" }
    else { Err $log "Gate knowledge FAIL (policy=block)" }

    $manifestVersion = $null
    try {
        $manifestPath = Join-Path $RepoRoot "src\server\knowledge\zarathoustra.manifest.json"
        if (Test-Path -LiteralPath $manifestPath) {
            $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($manifest -and $manifest.generatedAt) { $manifestVersion = [string]$manifest.generatedAt }
        }
    } catch {}

    $txtPath = Join-Path $runDir ("gate_knowledge_{0}.txt" -f $RunStamp)
    $jsonPath = Join-Path $runDir ("gate_knowledge_{0}.json" -f $RunStamp)

    $payload = [ordered]@{
        timestamp = (Get-Date).ToString("o")
        runStamp = $RunStamp
        repoRoot = $RepoRoot
        policy = $policyValue
        manifestVersion = $manifestVersion
        testExit = $step.ExitCode
        exit = $exitCode
        verdict = if ($exitCode -eq 0) { "PASS" } elseif ($exitCode -eq 2) { "WARN" } else { "FAIL" }
        testLog = $testLog
        logs = $log.Lines
    }

    Set-Content -LiteralPath $txtPath -Value ($log.Lines -join "`r`n") -Encoding ascii
    ($payload | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $jsonPath -Encoding ascii

    if ($exitCode -eq 0) { exit 0 }
    if ($exitCode -eq 2) { exit 2 }
    exit 1
}
catch {
    Err $log $_.Exception.Message
    exit 1
}
finally {
    if ($pushed) { Pop-Location }
}
