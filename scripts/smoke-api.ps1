[CmdletBinding()]
param(
    [string]$BaseUrl = "http://127.0.0.1:3000",
    [string]$NameOrNickname = "florian",
    [string]$Prompt = "Rituel: je franchis le seuil.",
    [int]$TimeoutSec = 45,
    [switch]$RequireCitations
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Fail([string]$msg) { Write-Host $msg -ForegroundColor Red; exit 1 }
function WarnMsg([string]$msg) { Write-Host $msg -ForegroundColor Yellow }
function OkMsg([string]$msg) { Write-Host $msg -ForegroundColor Green }

$traceId = "smoke_" + (Get-Date).ToString("yyyyMMdd_HHmmss")
$uri = ($BaseUrl.TrimEnd("/") + "/api/gemini")

$payloadObj = @{
    traceId         = $traceId
    mode            = "oracle"
    prompt          = $Prompt
    ritual          = @{
        nameOrNickname = $NameOrNickname
        step1          = "seuil"
        step2          = "preuve"
    }
    expectJson      = $true
    maxOutputTokens = 900
    temperature     = 0.7
}

$payload = $payloadObj | ConvertTo-Json -Depth 12

Write-Host "[smoke-api] POST $uri"
try {
    $resp = Invoke-RestMethod -Method Post -Uri $uri -ContentType "application/json" -Body $payload -TimeoutSec $TimeoutSec
}
catch {
    Fail ("[smoke-api] FAIL HTTP: " + $_.Exception.Message)
}

# Some implementations return { json: {...} }, others return {...}
$json = $resp
if ($null -ne $resp -and ($resp.PSObject.Properties.Name -contains "json")) { $json = $resp.json }

if ($null -eq $json) { Fail "[smoke-api] FAIL: empty JSON response" }

$hasCitations = $false
$zaraHint = $false

try {
    if ($json.PSObject.Properties.Name -contains "citations") {
        if ($json.citations -and $json.citations.Count -ge 1) {
            $hasCitations = $true
            foreach ($c in $json.citations) {
                if ($c.part_title -or $c.section_title) { $zaraHint = $true; break }
            }
        }
    }
}
catch {}

if (-not $hasCitations) {
    if ($RequireCitations) { Fail "[smoke-api] FAIL: no citations detected (retriever/corpus?)" }
    WarnMsg "[smoke-api] WARN: no citations detected (check retriever/corpus)"
}
else {
    if ($zaraHint) { OkMsg "[smoke-api] OK: citations present (Zarathoustra hint detected)" }
    else { OkMsg "[smoke-api] OK: citations present" }
}

Write-Host "[smoke-api] traceId=$traceId"
$json | ConvertTo-Json -Depth 12 | Write-Host
