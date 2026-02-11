[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$DeployUrl,

    [string]$BypassSecretEnvVarName = "VERCEL_AUTOMATION_BYPASS_SECRET",
    [Alias('Stamp')]
    [string]$RunStamp = "",
    [int]$TimeoutSec = 45,
    [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ScriptDir "..\_lib\Log.ps1")
. (Join-Path $ScriptDir "..\_auditRun.ps1")

$log = New-LogState
if (-not $PSBoundParameters.ContainsKey("Quiet")) { $Quiet = $true }
if ($Quiet) { $VerbosePreference = "SilentlyContinue" }

function Has-Prop($obj, [string]$name) {
    if ($null -eq $obj) { return $false }
    return $obj.PSObject.Properties.Name -contains $name
}

try {
    $audit = Resolve-AuditRun -RepoRoot "" -OutDir ".\audit" -RunStamp $RunStamp -Mode "" -Prefix "PRODSMOKE" -CleanLatest:$false
    $RunStamp = $audit.RunStamp
    $runDir = $audit.RunDir

    $txtPath = Join-Path $runDir ("vercel_prod_smoke_{0}.txt" -f $RunStamp)
    $jsonPath = Join-Path $runDir ("vercel_prod_smoke_{0}.json" -f $RunStamp)

    if ([string]::IsNullOrWhiteSpace($DeployUrl)) {
        Err $log "DeployUrl is required"
        throw "DeployUrl is required"
    }

    $bypass = [Environment]::GetEnvironmentVariable($BypassSecretEnvVarName, "Process")
    if ([string]::IsNullOrWhiteSpace($bypass)) {
        Err $log "Bypass secret missing in env"
        throw "Bypass secret missing in env"
    }

    $headers = @{ "x-vercel-protection-bypass" = $bypass }
    $base = $DeployUrl.TrimEnd("/")

    Info $log ("Target : {0}" -f $base)

    $okCount = 0
    $errCount = 0

    # GET /
    try {
        $resp = Invoke-WebRequest -Method Get -Uri ($base + "/") -Headers $headers -TimeoutSec $TimeoutSec
        if ($resp.StatusCode -ne 200) { throw "HTTP status $($resp.StatusCode)" }
        if ($resp.Content -notmatch "Oracle de Zarathoustra") { throw "Title mismatch" }
        Ok $log "GET / OK"
        $okCount++
    } catch {
        Err $log ("GET / FAIL: {0}" -f $_.Exception.Message)
        $errCount++
    }

    # POST /api/gemini ping
    $traceId = "prod_smoke_" + (Get-Date).ToString("yyyyMMdd_HHmmss")
    $pingPayload = @{ traceId = $traceId; mode = "raw"; prompt = "ping"; expectJson = $false }
    try {
        $ping = Invoke-RestMethod -Method Post -Uri ($base + "/api/gemini") -Headers $headers -ContentType "application/json" -Body ($pingPayload | ConvertTo-Json -Depth 8) -TimeoutSec $TimeoutSec
        if (-not (Has-Prop $ping "traceId")) { throw "traceId missing" }
        if (-not (Has-Prop $ping "mode")) { throw "mode missing" }
        if (-not (Has-Prop $ping "model")) { throw "model missing" }
        if (-not (Has-Prop $ping "text")) { throw "text missing" }
        if (-not (Has-Prop $ping "json")) { throw "json missing" }
        if (-not (Has-Prop $ping "jsonError")) { throw "jsonError missing" }
        if (-not (Has-Prop $ping "citationsUsed")) { throw "citationsUsed missing" }
        Ok $log "POST /api/gemini ping OK"
        $okCount++
    } catch {
        Err $log ("POST /api/gemini ping FAIL: {0}" -f $_.Exception.Message)
        $errCount++
    }

    # POST /api/gemini citations
    $citPayload = @{
        traceId = $traceId + "_cit"
        mode = "oracle"
        prompt = "Rituel: je franchis le seuil et je cite Zarathoustra."
        ritual = @{ nameOrNickname = "prod"; step1 = "seuil"; step2 = "preuve" }
        expectJson = $true
        wantCitations = $true
    }

    try {
        $cit = Invoke-RestMethod -Method Post -Uri ($base + "/api/gemini") -Headers $headers -ContentType "application/json" -Body ($citPayload | ConvertTo-Json -Depth 12) -TimeoutSec $TimeoutSec
        if (-not (Has-Prop $cit "citationsUsed")) { throw "citationsUsed missing" }
        $count = if ($cit.citationsUsed) { $cit.citationsUsed.Count } else { 0 }
        if ($count -lt 2) { throw "citationsUsed < 2" }
        $bad = $false
        foreach ($c in $cit.citationsUsed) {
            if (-not $c.id -or [string]::IsNullOrWhiteSpace([string]$c.id)) { $bad = $true; break }
            if ($c.source -ne "zarathoustra") { $bad = $true; break }
        }
        if ($bad) { throw "citationsUsed invalid" }
        Ok $log "POST /api/gemini citations OK"
        $okCount++
    } catch {
        Err $log ("POST /api/gemini citations FAIL: {0}" -f $_.Exception.Message)
        $errCount++
    }

    $exitCode = if ($errCount -eq 0) { 0 } else { 1 }
    if ($exitCode -eq 0) { Ok $log "vercel-prod-smoke PASS" } else { Err $log "vercel-prod-smoke FAIL" }

    $payload = [ordered]@{
        timestamp = (Get-Date).ToString("o")
        runStamp = $RunStamp
        target = $base
        ok = $okCount
        err = $errCount
        exit = $exitCode
        logs = $log.Lines
    }

    Set-Content -LiteralPath $txtPath -Value ($log.Lines -join "`r`n") -Encoding ascii
    ($payload | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $jsonPath -Encoding ascii

    exit $exitCode
}
catch {
    Err $log $_.Exception.Message
    exit 1
}
