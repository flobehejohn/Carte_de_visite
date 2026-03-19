param(
  [string]$BaseUrl = "http://127.0.0.1:3000",
  [string]$ArtifactsDir = ".\artifacts\runtime-audit",
  [switch]$SkipRootCheck
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Step([string]$Text) {
  Write-Host "`n=== $Text ===" -ForegroundColor Cyan
}

function Invoke-JsonPost {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [Parameter(Mandatory = $true)][hashtable]$Payload
  )

  $json = $Payload | ConvertTo-Json -Depth 20
  $r = Invoke-WebRequest `
    -Method Post `
    -Uri $Uri `
    -ContentType "application/json" `
    -Body $json `
    -SkipHttpErrorCheck

  $body = $null
  try {
    $body = $r.Content | ConvertFrom-Json
  } catch {
    throw "Réponse non JSON. status=$($r.StatusCode) raw=$($r.Content)"
  }

  [pscustomobject]@{
    StatusCode = $r.StatusCode
    Body       = $body
    Raw        = $r.Content
  }
}

function Get-ShortFailureReason {
  param([Parameter(Mandatory = $true)]$Response)

  $body = $Response.Body
  if ($null -eq $body) {
    return "body null"
  }

  if ($body.error -and $body.error.message) {
    return "$($body.error.code): $($body.error.message)"
  }

  if ($body.finalJsonError) {
    return "finalJsonError=$($body.finalJsonError)"
  }

  if ($body.jsonError) {
    return "jsonError=$($body.jsonError)"
  }

  return ($Response.Raw | Out-String).Trim()
}

function Assert-Guardian {
  param([Parameter(Mandatory = $true)]$Response)

  if ($Response.StatusCode -ne 200) {
    throw "[guardian] HTTP=$($Response.StatusCode) :: $(Get-ShortFailureReason -Response $Response)"
  }

  $b = $Response.Body

  if (-not $b.ok) {
    throw "[guardian] ok=false :: $(Get-ShortFailureReason -Response $Response)"
  }

  if ($null -ne $b.finalJsonError -and "$($b.finalJsonError)".Trim().Length -gt 0) {
    throw "[guardian] finalJsonError=$($b.finalJsonError)"
  }

  $hasGovernedGuidance =
    $null -ne $b.guidance -and
    $null -ne $b.guidance.echo -and
    "$($b.guidance.echo)".Trim().Length -gt 0 -and
    $null -ne $b.guidance.subcomment -and
    "$($b.guidance.subcomment)".Trim().Length -gt 0

  $hasLegacyText =
    ($null -ne $b.text -and "$($b.text)".Trim().Length -gt 0) -or
    ($null -ne $b.json -and $null -ne $b.json.comment -and "$($b.json.comment)".Trim().Length -gt 0)

  if (-not ($hasGovernedGuidance -or $hasLegacyText)) {
    throw "[guardian] aucun contenu guidance/comment exploitable"
  }

  Write-Host "[guardian] OK" -ForegroundColor Green
}

function Assert-Oracle {
  param([Parameter(Mandatory = $true)]$Response)

  if ($Response.StatusCode -ne 200) {
    throw "[oracle] HTTP=$($Response.StatusCode) :: $(Get-ShortFailureReason -Response $Response)"
  }

  $b = $Response.Body

  if (-not $b.ok) {
    throw "[oracle] ok=false :: $(Get-ShortFailureReason -Response $Response)"
  }

  if ($null -ne $b.finalJsonError -and "$($b.finalJsonError)".Trim().Length -gt 0) {
    throw "[oracle] finalJsonError=$($b.finalJsonError)"
  }

  if ($null -ne $b.jsonError -and "$($b.jsonError)".Trim().Length -gt 0) {
    throw "[oracle] jsonError=$($b.jsonError)"
  }

  if ($null -eq $b.hermeneutic) {
    throw "[oracle] hermeneutic absent"
  }

  if ($null -eq $b.composition) {
    throw "[oracle] composition absente"
  }

  if ($null -eq $b.composition.prose -or "$($b.composition.prose)".Trim().Length -eq 0) {
    throw "[oracle] composition.prose vide"
  }

  $anchors = @($b.hermeneutic.anchors)
  if ($anchors.Count -lt 2) {
    throw "[oracle] anchors insuffisants"
  }

  $roles = @($anchors | ForEach-Object { "$($_.role)".Trim().ToLowerInvariant() } | Sort-Object -Unique)
  $expectedRoles = @('anchor', 'tension', 'turn')
  $cmpRoles = Compare-Object $roles $expectedRoles
  if ($cmpRoles) {
    throw "[oracle] roles invalides : $($roles -join ', ')"
  }

  if ($null -ne $b.composition.motifs) {
    $motifRoles = @($b.composition.motifs | ForEach-Object { "$($_.role)".Trim().ToLowerInvariant() } | Sort-Object -Unique)
    $cmpMotifs = Compare-Object $motifRoles $expectedRoles
    if ($cmpMotifs) {
      throw "[oracle] motif roles invalides : $($motifRoles -join ', ')"
    }
  }

  $citCount = @($b.citationsUsed).Count
  if ($citCount -lt 2) {
    throw "[oracle] citationsUsed insuffisant : $citCount"
  }

  Write-Host "[oracle] OK" -ForegroundColor Green
}

$null = New-Item -ItemType Directory -Force -Path $ArtifactsDir

$guardianPayload = @{
  mode = "guardian"
  prompt = "Gardien: validation finale"
  expectJson = $true
  wantCitations = $true
  minCitations = 2
  step = "identity"
  value = "Jeanne"
}

$oraclePayload = @{
  mode = "oracle"
  prompt = "Validation finale oracle"
  expectJson = $true
  wantCitations = $true
  minCitations = 2
  ritual = @{
    nameOrNickname = "florian"
    mood = "curieux"
    format = "Conseil"
    questionText = "Que signifie mon nom dans le rite ?"
    weight = ""
    fear = ""
    desire = ""
    sacrifice = ""
    social = ""
    eternity = ""
  }
}

$portLabel = try { ([uri]$BaseUrl).Port } catch { "custom" }

if (-not $SkipRootCheck) {
  Write-Step "ROOT CHECK $BaseUrl"
  $root = Invoke-WebRequest -UseBasicParsing $BaseUrl
  Write-Host ("root status={0}" -f $root.StatusCode) -ForegroundColor Green
}

Write-Step "GUARDIAN $BaseUrl"
$g = Invoke-JsonPost -Uri "$BaseUrl/api/gemini" -Payload $guardianPayload
$g.Raw | Set-Content (Join-Path $ArtifactsDir "guardian.$portLabel.json") -Encoding UTF8
$g | Select-Object StatusCode | Format-List
Assert-Guardian -Response $g

Write-Step "ORACLE $BaseUrl"
$o = Invoke-JsonPost -Uri "$BaseUrl/api/gemini" -Payload $oraclePayload
$o.Raw | Set-Content (Join-Path $ArtifactsDir "oracle.$portLabel.json") -Encoding UTF8
$o | Select-Object StatusCode | Format-List
Assert-Oracle -Response $o

Write-Step "SUMMARY"
[pscustomobject]@{
  BaseUrl         = $BaseUrl
  GuardianStatus  = $g.StatusCode
  OracleStatus    = $o.StatusCode
  OracleRoles     = (@($o.Body.hermeneutic.anchors | ForEach-Object { $_.role } | Sort-Object -Unique) -join ', ')
  OracleMotifRoles = (@($o.Body.composition.motifs | ForEach-Object { $_.role } | Sort-Object -Unique) -join ', ')
  OracleCitations = @($o.Body.citationsUsed).Count
  OracleTraceId   = $o.Body.traceId
} | Format-List

Write-Host "`nRUNTIME CHECK OK." -ForegroundColor Green
exit 0
