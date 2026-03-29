[CmdletBinding()]
param(
  [string]$BaseUrl = "http://127.0.0.1:3000",
  [string]$NameOrNickname = "florian",
  [string]$Prompt = "Rituel: je franchis le seuil.",
  [int]$TimeoutSec = 45,
  [switch]$RequireCitations,
  [switch]$EmitJsonSummary,
  [string]$Endpoint = "/api/gemini"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Fail([string]$msg, [int]$code = 1) { Write-Host $msg -ForegroundColor Red; exit $code }
function WarnMsg([string]$msg) { Write-Host $msg -ForegroundColor Yellow }
function OkMsg([string]$msg) { Write-Host $msg -ForegroundColor Green }
function InfoMsg([string]$msg) { Write-Host $msg -ForegroundColor Cyan }

function Parse-BaseUrl([string]$u) {
  try { return [Uri]$u } catch { Fail "[smoke-api] FAIL: BaseUrl invalide: $u" 2 }
}

function Assert-Listening([string]$bindHost, [int]$port) {
  if (-not $IsWindows) { return } # skip non-windows
  $listening = @(
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object {
      $_.LocalPort -eq $port -and (
        $_.LocalAddress -eq $bindHost -or
        $_.LocalAddress -eq "127.0.0.1" -or
        $_.LocalAddress -eq "0.0.0.0" -or
        $_.LocalAddress -eq "::"
      )
    }
  )

  if ($listening.Length -eq 0) {
    Fail "[smoke-api] FAIL: aucun serveur n'écoute sur ${bindHost}:$port. Démarre: pwsh -NoProfile -File .\scripts\run\dev.ps1 -Mode vercel -Port $port" 3
  }
}

function Get-HttpStatusCodeFromException($ex) {
  try {
    if ($null -ne $ex.Response -and $ex.Response.StatusCode) { return [int]$ex.Response.StatusCode }
  }
  catch {}
  return $null
}

function Unwrap-Json($resp) {
  if ($null -eq $resp) { return $null }
  if ($resp.PSObject.Properties.Name -contains "json") { return $resp.json }
  return $resp
}

function Get-CitationsCount($json) {
  if ($null -eq $json) { return 0 }

  if ($json.PSObject.Properties.Name -contains "citations") {
    $c = $json.citations
    if ($null -ne $c) { return @($c).Count }
  }

  if ($json.PSObject.Properties.Name -contains "citationsUsed") {
    try { return [int]$json.citationsUsed } catch { return 0 }
  }

  return 0
}

function Get-ZaraHint($json) {
  if ($null -eq $json) { return $false }
  if ($json.PSObject.Properties.Name -contains "citations" -and $json.citations) {
    foreach ($c in @($json.citations)) {
      if ($c.part_title -or $c.section_title -or $c.source -or $c.title) { return $true }
    }
  }
  return $false
}

$baseUri = Parse-BaseUrl $BaseUrl
$bindHost = $baseUri.Host
$port = $baseUri.Port

Assert-Listening -bindHost $bindHost -port $port

$traceId = "smoke_" + (Get-Date).ToString("yyyyMMdd_HHmmss")
$Endpoint = if ($Endpoint.StartsWith("/")) { $Endpoint } else { "/$Endpoint" }
$uri = ($BaseUrl.TrimEnd("/") + $Endpoint)

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

InfoMsg "[smoke-api] POST $uri"
$started = Get-Date

$resp = $null
try {
  $resp = Invoke-RestMethod -Method Post -Uri $uri -ContentType "application/json" -Body $payload -TimeoutSec $TimeoutSec
}
catch {
  $status = Get-HttpStatusCodeFromException $_.Exception
  if ($status -eq 404) {
    Fail "[smoke-api] FAIL HTTP 404 sur $Endpoint. Probable: mode Vite (UI) sans /api. Lance: pwsh -NoProfile -File .\scripts\run\dev.ps1 -Mode vercel -Port $port" 4
  }
  if ($status) { Fail ("[smoke-api] FAIL HTTP ${status}: " + $_.Exception.Message) 5 }
  Fail ("[smoke-api] FAIL HTTP: " + $_.Exception.Message) 6
}

$elapsedMs = [int]((Get-Date) - $started).TotalMilliseconds
# On accepte une réponse "oracle" même si json=null
$json = Unwrap-Json $resp
if ($null -eq $json) { $json = $resp }
if ($null -eq $json) { Fail "[smoke-api] FAIL: empty response" 7 }$citCount = Get-CitationsCount $json
$zaraHint = Get-ZaraHint $json

if ($citCount -lt 1) {
  if ($RequireCitations) { Fail "[smoke-api] FAIL: no citations detected (retriever/corpus?)" 8 }
  WarnMsg "[smoke-api] WARN: no citations detected"
}
else {
  if ($zaraHint) { OkMsg "[smoke-api] OK: citations present (Zara hint) count=$citCount" }
  else { OkMsg "[smoke-api] OK: citations present count=$citCount" }
}

InfoMsg "[smoke-api] traceId=$traceId elapsedMs=$elapsedMs"

if ($EmitJsonSummary) {
  $summary = [ordered]@{
    ok           = $true
    traceId      = $traceId
    baseUrl      = $BaseUrl
    endpoint     = $Endpoint
    elapsedMs    = $elapsedMs
    citations    = $citCount
    zaraHint     = $zaraHint
    requireCites = [bool]$RequireCitations
  }
  $summary | ConvertTo-Json -Depth 6 | Write-Host
}

$json | ConvertTo-Json -Depth 12 | Write-Host
