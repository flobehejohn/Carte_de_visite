[CmdletBinding()]
param(
  [string]$BaseUrl = "http://127.0.0.1:3001",
  [int]$TimeoutSec = 45,
  [int]$MinCitations = 2,
  [string]$RepoRoot = "",
  [string]$CorpusFile = "",
  [switch]$RequireCorpusProof,
  [string]$OutFile = "audit/_latest/rag-cert.json",
  [string]$Prompt = "Rituel: prouve que tu utilises le corpus Zarathoustra. Cite au moins 2 extraits."
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Fail([string]$msg, [int]$code = 1) { Write-Host $msg -ForegroundColor Red; exit $code }
function OkMsg([string]$msg) { Write-Host $msg -ForegroundColor Green }
function WarnMsg([string]$msg) { Write-Host $msg -ForegroundColor Yellow }
function InfoMsg([string]$msg) { Write-Host $msg -ForegroundColor Cyan }

function Ensure-Dir([string]$path) {
  $dir = Split-Path -Parent $path
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
}

function Parse-BaseUrl([string]$u) {
  try { return [Uri]$u } catch { Fail "[rag-cert] FAIL: BaseUrl invalide: $u" 2 }
}

function Find-CorpusFile([string]$root) {
  # Cherche dans des zones “saines” (évite node_modules/.git/.vercel/audit/dist)
  $exclude = @("node_modules",".git",".vercel","dist","build","out","coverage","audit")
  $dirs = Get-ChildItem -Path $root -Directory -ErrorAction SilentlyContinue |
    Where-Object { $exclude -notcontains $_.Name }

  $candidates = @()

  foreach ($d in $dirs) {
    $candidates += Get-ChildItem -Path $d.FullName -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object {
        $_.Name -match "zara|zarathoustra" -and $_.Extension -match "\.(txt|json)$" -and $_.FullName -notmatch "\\node_modules\\|\\\.git\\|\\\.vercel\\|\\audit\\|\\dist\\|\\build\\|\\coverage\\"
      }
  }

  if ($candidates.Count -gt 0) {
    # prend le plus gros (souvent le corpus)
    return ($candidates | Sort-Object Length -Descending | Select-Object -First 1).FullName
  }
  return ""
}

function Extract-CitationText($c) {
  foreach ($k in @("excerpt","quote","text","content","passage","snippet")) {
    try {
      if ($c.PSObject.Properties.Name -contains $k) {
        $v = [string]$c.$k
        if ($v -and $v.Trim().Length -ge 20) { return $v.Trim() }
      }
    } catch {}
  }
  return ""
}

# RepoRoot : par défaut, 2 niveaux au-dessus de scripts/diag
if (-not $RepoRoot) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}
Set-Location $RepoRoot

$baseUri = Parse-BaseUrl $BaseUrl
$uri = ($BaseUrl.TrimEnd("/") + "/api/gemini")
$traceId = "ragcert_" + (Get-Date).ToString("yyyyMMdd_HHmmss")

# Corpus: auto si non fourni
if (-not $CorpusFile) { $CorpusFile = Find-CorpusFile -root $RepoRoot }

$corpusText = ""
if ($CorpusFile -and (Test-Path $CorpusFile)) {
  InfoMsg "[rag-cert] corpusFile=$CorpusFile"
  $corpusText = Get-Content -LiteralPath $CorpusFile -Raw -ErrorAction Stop
} else {
  if ($RequireCorpusProof) {
    Fail "[rag-cert] FAIL: corpusFile introuvable. Passe -CorpusFile <path> ou ajoute le corpus dans le repo. (RequireCorpusProof=ON)" 20
  }
  WarnMsg "[rag-cert] WARN: corpusFile introuvable => preuve 'in-corpus' SKIP"
}

$payloadObj = @{
  traceId         = $traceId
  mode            = "oracle"
  prompt          = $Prompt
  ritual          = @{
    nameOrNickname = "florian"
    step1          = "seuil"
    step2          = "preuve"
  }
  expectJson      = $true
  maxOutputTokens = 900
  temperature     = 0.7
  wantCitations   = $true
}

$payload = $payloadObj | ConvertTo-Json -Depth 12

InfoMsg "[rag-cert] POST $uri traceId=$traceId"
$started = Get-Date

$resp = $null
try {
  $resp = Invoke-RestMethod -Method Post -Uri $uri -ContentType "application/json" -Body $payload -TimeoutSec $TimeoutSec
} catch {
  Fail ("[rag-cert] FAIL HTTP: " + $_.Exception.Message) 10
}

$elapsedMs = [int]((Get-Date) - $started).TotalMilliseconds

if ($null -eq $resp) { Fail "[rag-cert] FAIL: empty response" 11 }
if (-not ($resp.PSObject.Properties.Name -contains "ok")) { Fail "[rag-cert] FAIL: missing 'ok' in response envelope" 12 }
if ($resp.ok -ne $true) {
  $code = ""; $msg = ""
  try { $code = [string]$resp.error.code } catch {}
  try { $msg  = [string]$resp.error.message } catch {}
  Fail "[rag-cert] FAIL: ok=false code=$code message=$msg" 13
}

$mode = ""
try { $mode = [string]$resp.mode } catch {}
if ($mode -ne "oracle") { Fail "[rag-cert] FAIL: expected mode=oracle, got '$mode'" 14 }

$citUsed = @()
try { $citUsed = @($resp.citationsUsed) } catch { $citUsed = @() }
if ($citUsed.Count -lt $MinCitations) {
  Fail "[rag-cert] FAIL: citationsUsed=$($citUsed.Count) < MinCitations=$MinCitations" 15
}

# Citations dans json (si présentes)
$json = $null
try { $json = $resp.json } catch {}
$citJson = @()
try {
  if ($null -ne $json -and ($json.PSObject.Properties.Name -contains "citations")) {
    $citJson = @($json.citations)
  }
} catch {}

# Preuve "in-corpus" si on peut extraire du texte
$proofs = @()
if ($corpusText) {
  $allCits = @()
  if ($citJson.Count -gt 0) { $allCits += $citJson } else { $allCits += $citUsed }

  $checked = 0
  foreach ($c in $allCits) {
    $t = Extract-CitationText $c
    if (-not $t) { continue }
    $checked++

    $ok = $corpusText.Contains($t)
    $proofs += [ordered]@{ hasText=$true; inCorpus=$ok; sampleLen=$t.Length }

    if (-not $ok) {
      Fail "[rag-cert] FAIL: un extrait de citation n'a pas été retrouvé dans le corpus (anti-hallucination)" 16
    }
    if ($checked -ge $MinCitations) { break }
  }

  if ($checked -lt 1 -and $RequireCorpusProof) {
    Fail "[rag-cert] FAIL: aucune citation n'a d'extrait exploitable (excerpt/quote/text...). RequireCorpusProof=ON" 21
  }
  elseif ($checked -lt 1) {
    WarnMsg "[rag-cert] WARN: aucune citation ne contient d'extrait exploitable => preuve 'in-corpus' SKIP"
  }
}

Ensure-Dir $OutFile

$artifact = [ordered]@{
  ok              = $true
  traceId         = $traceId
  baseUrl         = $BaseUrl
  endpoint        = "/api/gemini"
  elapsedMs       = $elapsedMs
  mode            = $mode
  citationsUsed   = $citUsed.Count
  citationsInJson = $citJson.Count
  corpusFile      = $CorpusFile
  inCorpusProofs  = $proofs
}

($artifact | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $OutFile -Encoding UTF8

OkMsg "[rag-cert] PASS: citationsUsed=$($citUsed.Count) elapsedMs=$elapsedMs artifact=$OutFile"
