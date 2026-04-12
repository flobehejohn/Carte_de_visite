[CmdletBinding()]
param(
    [string]$Url = "http://127.0.0.1:3000/api/gemini",
    [ValidateSet("raw", "oracle", "guardian")]
    [string]$Mode = "guardian",
    [string]$Prompt = "Rituel: test JSON stable + citations",
    [int]$MinCitations = 2,
    [double]$Temperature = 0.1,
    [double]$TopP = 0.9,
    [int]$MaxOutputTokens = 512
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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

function Invoke-GeminiEnvelope {
    [CmdletBinding()]
    param(
        [string]$Url = "http://127.0.0.1:3000/api/gemini",
        [ValidateSet("raw", "oracle", "guardian")]
        [string]$Mode = "guardian",
        [string]$Prompt = "Rituel: test JSON stable + citations",
        [int]$MinCitations = 2,
        [double]$Temperature = 0.1,
        [double]$TopP = 0.9,
        [int]$MaxOutputTokens = 512
    )

    $body = @{
        mode            = $Mode
        prompt          = $Prompt
        expectJson      = $true
        wantCitations   = $true
        minCitations    = $MinCitations
        temperature     = $Temperature
        topP            = $TopP
        maxOutputTokens = $MaxOutputTokens
    } | ConvertTo-Json -Depth 10

    $r = Invoke-WebRequest -Method Post -Uri $Url `
        -ContentType "application/json" `
        -Body $body `
        -SkipHttpErrorCheck

    $j = $null
    if ($r.Content) {
        try {
            $j = $r.Content | ConvertFrom-Json -Depth 100
        }
        catch {
            $j = $null
        }
    }

    $citations = @((Get-Prop $j "citationsUsed" @()))
    $sources = @(
        $citations |
        ForEach-Object { "$((Get-Prop $_ 'source' ''))" } |
        Where-Object { $_ } |
        Sort-Object -Unique
    )

    $violations = @((Get-Prop $j "violations" @()))
    $jsonViolations = @($violations | Where-Object { (Get-Prop $_ "code" "") -eq "JSON_ERROR" })
    $raw = Get-Prop $j "raw"
    $meta = Get-Prop $j "meta"
    $knowledge = Get-Prop $j "knowledge"
    $debug = Get-Prop $j "debug"
    $finalJsonError = Get-Prop $j "finalJsonError"

    [pscustomobject]@{
        status         = [int]$r.StatusCode
        ok             = Get-Bool (Get-Prop $j "ok" $false)
        reason         = Get-Prop $raw "reason"
        rawStructured  = Get-Bool (Get-Prop $raw "structured" $false)
        fallback       = Get-Bool (Get-Prop $raw "fallback" $false)
        repairApplied  = Get-Bool (Get-Prop $raw "repairApplied" $false)
        retryCount     = [int](Get-Prop $raw "retryCount" 0)
        rawJsonError   = Get-Prop $j "rawJsonError"
        finalJsonError = $finalJsonError
        structuredUsed = Get-Bool (Get-Prop $meta "structuredUsed" $false)
        corpusLoaded   = Get-Bool (Get-Prop $knowledge "corpusLoaded" $false)
        citationsCount = $citations.Count
        sources        = ($sources -join ",")
        violations     = (@($violations | ForEach-Object { Get-Prop $_ "code" "" } | Where-Object { $_ }) -join ",")
        mixedSignalA   = ((Get-Bool (Get-Prop $meta "structuredUsed" $false)) -and ($null -ne $finalJsonError) -and "$finalJsonError" -ne "")
        mixedSignalB   = (($null -eq $finalJsonError -or "$finalJsonError" -eq "") -and ($jsonViolations.Count -gt 0))
        jsonPreview    = Get-Prop $debug "jsonPreview"
        textPreview    = Get-Prop $debug "textPreview"
    }
}

if ($MyInvocation.InvocationName -ne ".") {
    Invoke-GeminiEnvelope `
        -Url $Url `
        -Mode $Mode `
        -Prompt $Prompt `
        -MinCitations $MinCitations `
        -Temperature $Temperature `
        -TopP $TopP `
        -MaxOutputTokens $MaxOutputTokens
}
