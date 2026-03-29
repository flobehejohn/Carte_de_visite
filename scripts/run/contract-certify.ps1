[CmdletBinding()]
param(
    [string]$BaseUrl = "http://127.0.0.1:3000",
    [int]$Runs = 10,
    [int]$MinCitations = 2,
    [ValidateSet("raw", "oracle", "guardian")]
    [string]$Mode = "guardian",
    [string]$Prompt = "Rituel: test JSON stable + citations",
    [switch]$StopOnFail
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Fail([string]$msg) { Write-Host $msg -ForegroundColor Red }
function OkMsg([string]$msg) { Write-Host $msg -ForegroundColor Green }
function WarnMsg([string]$msg) { Write-Host $msg -ForegroundColor Yellow }

function Has-Prop($obj, [string]$name) {
    if ($null -eq $obj) { return $false }
    if ($null -eq $obj.PSObject) { return $false }
    return ($null -ne $obj.PSObject.Properties[$name])
}

function Get-Prop($obj, [string]$name, $default = $null) {
    if (Has-Prop $obj $name) {
        return $obj.$name
    }
    return $default
}

function Get-Bool($value) {
    if ($null -eq $value) { return $false }
    if ($value -is [bool]) { return $value }
    $s = "$value".Trim().ToLowerInvariant()
    return ($s -eq "1" -or $s -eq "true" -or $s -eq "yes")
}

function Test-Envelope([string]$Url, [string]$Mode, [int]$MinCitations, [string]$Prompt) {
    $body = @{
        mode            = $Mode
        prompt          = $Prompt
        expectJson      = $true
        wantCitations   = $true
        minCitations    = $MinCitations
        temperature     = 0.1
        topP            = 0.9
        maxOutputTokens = 512
    } | ConvertTo-Json -Depth 10

    $r = Invoke-WebRequest -Method Post -Uri $Url `
        -ContentType "application/json" `
        -Body $body `
        -SkipHttpErrorCheck

    $j = $r.Content | ConvertFrom-Json -Depth 100
    $citations = @((Get-Prop $j 'citationsUsed' @()))
    $violations = @((Get-Prop $j 'violations' @()))
    $jsonViolations = @($violations | Where-Object { (Get-Prop $_ 'code' '') -eq 'JSON_ERROR' })
    $sources = @(
        $citations |
        ForEach-Object { "$((Get-Prop $_ 'source' ''))" } |
        Where-Object { $_ } |
        Sort-Object -Unique
    )
    $knowledge = Get-Prop $j 'knowledge'
    $meta = Get-Prop $j 'meta'
    $raw = Get-Prop $j 'raw'
    $finalJsonError = Get-Prop $j 'finalJsonError'
    $violationCodes = @(
        $violations |
        ForEach-Object { Get-Prop $_ 'code' '' } |
        Where-Object { $_ }
    )

    $errors = New-Object System.Collections.Generic.List[string]

    if ([int]$r.StatusCode -ne 200) { $errors.Add("status=$($r.StatusCode)") }
    if (-not (Get-Bool (Get-Prop $j 'ok' $false))) { $errors.Add("ok=false") }
    if (-not (Get-Bool (Get-Prop $knowledge 'corpusLoaded' $false))) { $errors.Add("knowledge.corpusLoaded=false") }
    if ($citations.Count -lt $MinCitations) { $errors.Add("citations=$($citations.Count) < $MinCitations") }
    if ($sources.Count -ne 1 -or $sources[0] -ne "zarathoustra") { $errors.Add("sources=$($sources -join ',')") }
    if ($null -ne $finalJsonError -and "$finalJsonError" -ne "") { $errors.Add("finalJsonError=$finalJsonError") }
    if ($violationCodes.Count -gt 0) { $errors.Add("violations=$($violationCodes -join ',')") }
    if (-not (Get-Bool (Get-Prop $meta 'structuredUsed' $false))) { $errors.Add("structuredUsed=false") }
    if ((Get-Bool (Get-Prop $meta 'structuredUsed' $false)) -and ($null -ne $finalJsonError) -and "$finalJsonError" -ne "") {
        $errors.Add("mixed-signal: structuredUsed=true + finalJsonError=$finalJsonError")
    }
    if (($null -eq $finalJsonError -or "$finalJsonError" -eq "") -and ($jsonViolations.Count -gt 0)) {
        $errors.Add("mixed-signal: JSON_ERROR violation despite finalJsonError=null")
    }

    [pscustomobject]@{
        StatusCode     = [int]$r.StatusCode
        Ok             = ($errors.Count -eq 0)
        Errors         = @($errors)
        TraceId        = Get-Prop $j 'traceId'
        RawReason      = Get-Prop $raw 'reason'
        RawStructured  = Get-Bool (Get-Prop $raw 'structured' $false)
        Fallback       = Get-Bool (Get-Prop $raw 'fallback' $false)
        RepairApplied  = Get-Bool (Get-Prop $raw 'repairApplied' $false)
        RetryCount     = [int](Get-Prop $raw 'retryCount' 0)
        RawJsonError   = Get-Prop $j 'rawJsonError'
        FinalJsonError = $finalJsonError
        StructuredUsed = Get-Bool (Get-Prop $meta 'structuredUsed' $false)
        CitationsCount = $citations.Count
        Sources        = ($sources -join ',')
    }
}

$endpoint = "$BaseUrl/api/gemini"
$results = New-Object System.Collections.Generic.List[object]

for ($i = 1; $i -le $Runs; $i++) {
    $result = Test-Envelope -Url $endpoint -Mode $Mode -MinCitations $MinCitations -Prompt $Prompt
    $results.Add($result)

    if ($result.Ok) {
        OkMsg ("[{0}/{1}] OK traceId={2} rawReason={3} rawStructured={4} fallback={5} repair={6} retry={7}" -f `
                $i, $Runs, $result.TraceId, $result.RawReason, $result.RawStructured, $result.Fallback, $result.RepairApplied, $result.RetryCount)
    }
    else {
        Fail ("[{0}/{1}] FAIL traceId={2} => {3}" -f `
                $i, $Runs, $result.TraceId, ($result.Errors -join ' | '))
        if ($StopOnFail) { break }
    }
}

$failed = @($results | Where-Object { -not $_.Ok })
$passed = @($results | Where-Object { $_.Ok })

Write-Host ""
Write-Host "========== SUMMARY ==========" -ForegroundColor Cyan
Write-Host ("Passed: {0}" -f $passed.Count)
Write-Host ("Failed: {0}" -f $failed.Count)

if ($failed.Count -eq 0) {
    OkMsg "Certification GREEN"
    exit 0
}
else {
    WarnMsg "Certification NOT GREEN"
    $failed | Select-Object -First 5 | Format-Table TraceId, StatusCode, RawReason, RawJsonError, FinalJsonError, StructuredUsed, Sources, Errors -Auto
    exit 1
}
