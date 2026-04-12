[CmdletBinding()]
param(
  [string]$BindHost = "127.0.0.1",
  [int]$PortStart = 3001,
  [int]$PortEnd = 3999,
  [int]$StartupTimeoutSec = 45,
  [int]$TimeoutSec = 45,
  [int]$MinCitations = 2,
  [ValidateSet("oracle", "guardian")]
  [string]$Mode = "guardian",
  [string]$Prompt = "Rituel: prouve que tu utilises le corpus Zarathoustra. Cite au moins 2 extraits.",
  [string]$Endpoint = "/api/gemini",
  [switch]$KeepServer
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Fail([string]$msg, [int]$code = 1) {
  Write-Host $msg -ForegroundColor Red
  exit $code
}

function OkMsg([string]$msg) {
  Write-Host $msg -ForegroundColor Green
}

function WarnMsg([string]$msg) {
  Write-Host $msg -ForegroundColor Yellow
}

function InfoMsg([string]$msg) {
  Write-Host $msg -ForegroundColor Cyan
}

function Ensure-Dir([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) {
    New-Item -ItemType Directory -Force -Path $path | Out-Null
  }
}

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

function Get-Bool($v) {
  if ($null -eq $v) { return $false }
  if ($v -is [bool]) { return $v }
  $s = "$v".Trim().ToLowerInvariant()
  return ($s -eq "1" -or $s -eq "true" -or $s -eq "yes")
}

function Try-BootstrapLocalSecrets([string]$rootPath) {
  $secretsPath = Join-Path $rootPath "scripts\diag\secrets.local.ps1"
  if (-not (Test-Path -LiteralPath $secretsPath)) {
    return [pscustomobject]@{
      loaded = $false
      path   = $secretsPath
      reason = "missing"
    }
  }

  try {
    . $secretsPath
    $token = [string]($env:VERCEL_TOKEN)
    $hasToken = -not [string]::IsNullOrWhiteSpace($token)
    return [pscustomobject]@{
      loaded = $hasToken
      path   = $secretsPath
      reason = if ($hasToken) { "ok" } else { "no_token_in_script" }
    }
  }
  catch {
    return [pscustomobject]@{
      loaded = $false
      path   = $secretsPath
      reason = "exception"
      error  = $_.Exception.Message
    }
  }
}

function Get-EnvVarValue([string]$name) {
  $item = Get-Item -Path ("Env:{0}" -f $name) -ErrorAction SilentlyContinue
  if ($null -eq $item) { return $null }
  $value = [string]$item.Value
  if ([string]::IsNullOrWhiteSpace($value)) { return $null }
  return $value.Trim()
}

function Read-DotEnvMap([string]$path) {
  $map = @{}
  if (-not (Test-Path -LiteralPath $path)) { return $map }
  foreach ($rawLine in (Get-Content -LiteralPath $path -ErrorAction SilentlyContinue)) {
    if ($null -eq $rawLine) { continue }
    $line = $rawLine.Trim()
    if (-not $line) { continue }
    if ($line.StartsWith('#')) { continue }

    $m = [regex]::Match($line, '^(?:export\s+)?(?<k>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?<v>.*)$')
    if (-not $m.Success) { continue }
    $k = $m.Groups['k'].Value
    $v = $m.Groups['v'].Value.Trim()
    if ($v.Length -ge 2 -and (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'")))) {
      $v = $v.Substring(1, $v.Length - 2)
    }
    $map[$k] = $v
  }
  return $map
}

function Resolve-ApiKeySource([string]$rootPath) {
  $names = @('GEMINI_API_KEY', 'GOOGLE_API_KEY')
  foreach ($name in $names) {
    $value = Get-EnvVarValue -name $name
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return [pscustomobject]@{
        found  = $true
        key    = $name
        source = ("process-env:{0}" -f $name)
      }
    }
  }

  $files = @(
    [pscustomobject]@{ label = '.vercel/.env.development.local'; path = (Join-Path $rootPath '.vercel\.env.development.local') },
    [pscustomobject]@{ label = '.env.local'; path = (Join-Path $rootPath '.env.local') },
    [pscustomobject]@{ label = '.env.development.local'; path = (Join-Path $rootPath '.env.development.local') }
  )

  foreach ($file in $files) {
    if (-not (Test-Path -LiteralPath $file.path)) { continue }
    $map = Read-DotEnvMap -path $file.path
    foreach ($name in $names) {
      if (-not $map.ContainsKey($name)) { continue }
      $value = [string]$map[$name]
      if ([string]::IsNullOrWhiteSpace($value)) { continue }
      return [pscustomobject]@{
        found  = $true
        key    = $name
        source = $file.label
      }
    }
  }

  return [pscustomobject]@{
    found  = $false
    key    = $null
    source = $null
  }
}

function Get-Listening {
  param([int]$p, [string]$h)

  if (-not $IsWindows) { return @() }

  @(
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object {
      $_.LocalPort -eq $p -and (
        $_.LocalAddress -eq $h -or
        $_.LocalAddress -eq "127.0.0.1" -or
        $_.LocalAddress -eq "0.0.0.0" -or
        $_.LocalAddress -eq "::"
      )
    }
  )
}

function Find-FreePort {
  param([int]$from, [int]$to, [string]$h)

  for ($p = $from; $p -le $to; $p++) {
    if (@(Get-Listening -p $p -h $h).Length -eq 0) {
      return $p
    }
  }

  throw "Aucun port libre trouvé dans [$from..$to] sur $h"
}

function Stop-ProcessTree([int]$ProcessId) {
  if ($KeepServer) { return }

  if ($IsWindows) {
    try { & taskkill /PID $ProcessId /T /F | Out-Null } catch { }
    try { Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue } catch { }
  }
  else {
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Get-CitationsCount($respObj) {
  try {
    if (Has-Prop $respObj 'citationsUsed') {
      return @((Get-Prop $respObj 'citationsUsed' @())).Count
    }

    $json = Get-Prop $respObj 'json'
    if ($null -ne $json -and (Has-Prop $json 'citations')) {
      return @((Get-Prop $json 'citations' @())).Count
    }
  }
  catch { }

  return 0
}

function Invoke-GeminiEndpoint(
  [string]$baseUrl,
  [string]$endpoint,
  [string]$mode,
  [string]$prompt,
  [int]$timeoutSec,
  [string]$traceId
) {
  $uri = "$baseUrl$endpoint"

  $bodyObj = [ordered]@{
    traceId       = $traceId
    mode          = $mode
    prompt        = $prompt
    expectJson    = $true
    wantCitations = $true
    minCitations  = $MinCitations
  }

  $bodyJson = $bodyObj | ConvertTo-Json -Depth 20

  $resp = Invoke-WebRequest `
    -Method Post `
    -Uri $uri `
    -ContentType "application/json" `
    -TimeoutSec $timeoutSec `
    -Body $bodyJson `
    -SkipHttpErrorCheck

  $status = [int]$resp.StatusCode
  $content = $resp.Content

  $parsed = $null
  if ($content) {
    try {
      $parsed = $content | ConvertFrom-Json -Depth 100
    }
    catch {
      $parsed = $null
    }
  }

  [pscustomobject]@{
    httpStatus = $status
    body       = $content
    parsed     = $parsed
  }
}

function Resolve-VercelAuth([string]$rootPath) {
  $vercelCmd = Get-Command vercel -ErrorAction SilentlyContinue
  if ($null -eq $vercelCmd) {
    Fail "[e2e-gate] FAIL: la CLI vercel n'est pas disponible dans le PATH." 3
  }

  $token = [string]($env:VERCEL_TOKEN)
  if ($null -eq $token) { $token = "" }
  $token = $token.Trim()

  if ($token) {
    & vercel whoami --token $token *> $null
    if ($LASTEXITCODE -eq 0) {
      return "token"
    }

    WarnMsg "[e2e-gate] WARN: VERCEL_TOKEN invalide => fallback sur vercel login local"
    Remove-Item Env:VERCEL_TOKEN -ErrorAction SilentlyContinue
  }

  & vercel whoami *> $null
  if ($LASTEXITCODE -eq 0) {
    return "login"
  }

  $boot = Try-BootstrapLocalSecrets -rootPath $rootPath
  if ($boot.loaded) {
    InfoMsg "[e2e-gate] Bootstrap Vercel token depuis scripts/diag/secrets.local.ps1"
    $bootToken = [string]($env:VERCEL_TOKEN)
    if ($null -eq $bootToken) { $bootToken = "" }
    $bootToken = $bootToken.Trim()

    if ($bootToken) {
      & vercel whoami --token $bootToken *> $null
      if ($LASTEXITCODE -eq 0) {
        return "token"
      }
      WarnMsg "[e2e-gate] WARN: token chargé depuis secrets.local.ps1 invalide."
      Remove-Item Env:VERCEL_TOKEN -ErrorAction SilentlyContinue
    }
  }
  elseif ($boot.reason -eq "exception") {
    WarnMsg "[e2e-gate] WARN: impossible de charger secrets.local.ps1 ($($boot.error))"
  }

  if ($boot.reason -eq "missing") {
    Fail "[e2e-gate] FAIL: Vercel non authentifié. Fais 'vercel login', définis VERCEL_TOKEN valide, ou crée scripts/diag/secrets.local.ps1." 4
  }

  Fail "[e2e-gate] FAIL: Vercel non authentifié. Fais 'vercel login' ou définis VERCEL_TOKEN valide." 4
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $RepoRoot

$authMode = Resolve-VercelAuth -rootPath $RepoRoot
InfoMsg "[e2e-gate] Vercel auth mode=$authMode"

$apiKeyContext = Resolve-ApiKeySource -rootPath $RepoRoot
if ($apiKeyContext.found) {
  InfoMsg "[e2e-gate] API key preflight ok source=$($apiKeyContext.source) key=$($apiKeyContext.key)"
}
else {
  WarnMsg "[e2e-gate] WARN: no GEMINI_API_KEY/GOOGLE_API_KEY found in process env or local env files (.vercel/.env.development.local, .env.local, .env.development.local)."
}

$port = Find-FreePort -from $PortStart -to $PortEnd -h $BindHost
$baseUrl = "http://$BindHost`:$port"

$stamp = "E2E_{0:yyyyMMdd_HHmmss}" -f (Get-Date)
$artifactDir = Join-Path $RepoRoot "artifacts"
Ensure-Dir $artifactDir

$vercelOut = Join-Path $artifactDir "vercel-dev.$stamp.out.log"
$vercelErr = Join-Path $artifactDir "vercel-dev.$stamp.err.log"
$gateJson = Join-Path $artifactDir "gate.$stamp.json"
$responseJson = Join-Path $artifactDir "gate.$stamp.response.json"

InfoMsg "[e2e-gate] Starting vercel dev on $baseUrl (stamp=$stamp)"

$env:PORT = "$port"
$proc = $null

try {
  $devScript = Join-Path $RepoRoot "scripts\run\dev.ps1"
  if (-not (Test-Path -LiteralPath $devScript)) {
    Fail "[e2e-gate] FAIL: dev script introuvable: $devScript" 5
  }

  $proc = Start-Process `
    -FilePath "pwsh" `
    -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $devScript,
    "-Mode", "vercel",
    "-Port", "$port",
    "-BindHost", $BindHost
  ) `
    -WorkingDirectory $RepoRoot `
    -NoNewWindow `
    -PassThru `
    -RedirectStandardOutput $vercelOut `
    -RedirectStandardError $vercelErr

  $deadline = (Get-Date).AddSeconds($StartupTimeoutSec)

  while ((Get-Date) -lt $deadline) {
    if ($proc.HasExited) {
      $errTail = ""
      if (Test-Path $vercelErr) {
        $errTail = (Get-Content $vercelErr -Tail 180 | Out-String)
      }

      $outTail = ""
      if (Test-Path $vercelOut) {
        $outTail = (Get-Content $vercelOut -Tail 120 | Out-String)
      }

      Fail "[e2e-gate] FAIL: vercel dev quitté (exit=$($proc.ExitCode)).`n--- stdout tail ---`n$outTail`n--- stderr tail ---`n$errTail" 6
    }

    if (@(Get-Listening -p $port -h $BindHost).Length -gt 0) {
      break
    }

    Start-Sleep -Milliseconds 250
  }

  if (@(Get-Listening -p $port -h $BindHost).Length -eq 0) {
    Fail "[e2e-gate] FAIL: timeout démarrage vercel dev" 7
  }

  InfoMsg "[e2e-gate] Server is listening on $baseUrl"

  $traceId = "gate_$stamp"
  $t0 = Get-Date
  $http = Invoke-GeminiEndpoint `
    -baseUrl $baseUrl `
    -endpoint $Endpoint `
    -mode $Mode `
    -prompt $Prompt `
    -timeoutSec $TimeoutSec `
    -traceId $traceId
  $elapsedMs = [int]((Get-Date) - $t0).TotalMilliseconds

  $status = [int]$http.httpStatus
  $respObj = $http.parsed

  if ($http.body) {
    Set-Content -LiteralPath $responseJson -Value $http.body -Encoding UTF8
  }

  $fails = @()

  if ($status -ne 200) {
    $fails += "httpStatus=$status"
  }

  if ($null -eq $respObj) {
    $fails += "response_not_json"
  }
  else {
    $citationsUsed = @()
    if (Has-Prop $respObj 'citationsUsed') {
      $citationsUsed = @((Get-Prop $respObj 'citationsUsed' @()))
    }

    $violations = @()
    if (Has-Prop $respObj 'violations') {
      $violations = @((Get-Prop $respObj 'violations' @()))
    }

    $jsonViolations = @(
      $violations | Where-Object { (Get-Prop $_ 'code' '') -eq 'JSON_ERROR' }
    )

    $knowledge = Get-Prop $respObj 'knowledge'
    $meta = Get-Prop $respObj 'meta'
    $errorObj = Get-Prop $respObj 'error'
    $finalJsonError = Get-Prop $respObj 'finalJsonError'
    $rawJsonError = Get-Prop $respObj 'rawJsonError'
    $okValue = Get-Bool (Get-Prop $respObj 'ok' $false)

    $sources = @(
      $citationsUsed |
      ForEach-Object { "$((Get-Prop $_ 'source' ''))" } |
      Where-Object { $_ } |
      Sort-Object -Unique
    )

    if (-not $okValue) {
      if ($null -ne $errorObj -and (Has-Prop $errorObj 'code')) {
        $errorCode = "$($errorObj.code)"
        $fails += "api_ok=false code=$errorCode"
        if ($errorCode -eq "MISSING_API_KEY") {
          $preflightSource = "$($apiKeyContext.source)"
          if (-not $preflightSource) { $preflightSource = "none" }
          $fails += "missing_api_key_preflight source=$preflightSource"
        }
      }
      else {
        $fails += "api_ok=false"
      }
    }

    $citCount = Get-CitationsCount $respObj
    if ($citCount -lt $MinCitations) {
      $fails += "citations<$MinCitations (got=$citCount)"
    }

    if (-not (Has-Prop $respObj 'violations')) {
      $fails += "violations_missing"
    }

    if ($null -eq $knowledge) {
      $fails += "knowledge_missing"
    }
    elseif (-not (Get-Bool (Get-Prop $knowledge 'corpusLoaded' $false))) {
      $fails += "knowledge.corpusLoaded=false"
    }

    if ($null -eq $meta) {
      $fails += "meta_missing"
    }

    if ($sources.Count -ne 1 -or $sources[0] -ne 'zarathoustra') {
      $fails += "sources=$($sources -join ',')"
    }

    if ($null -ne $finalJsonError -and "$finalJsonError" -ne '') {
      $fails += "finalJsonError=$finalJsonError"
    }

    $structuredUsed = $false
    if ($null -ne $meta) {
      $structuredUsed = Get-Bool (Get-Prop $meta 'structuredUsed' $false)
    }

    if (-not $structuredUsed) {
      $fails += "structuredUsed=false"
    }

    if ($violations.Count -gt 0) {
      $fails += "violations=$($violations | ForEach-Object { Get-Prop $_ 'code' '' } | Where-Object { $_ } | Sort-Object -Unique -join ',')"
    }

    if (($structuredUsed -eq $true) -and ($null -ne $finalJsonError) -and "$finalJsonError" -ne '') {
      $fails += "mixed-signal: structuredUsed=true + finalJsonError=$finalJsonError"
    }

    if (($null -eq $finalJsonError -or "$finalJsonError" -eq '') -and ($jsonViolations.Count -gt 0)) {
      $fails += "mixed-signal: JSON_ERROR violation despite finalJsonError=null"
    }
  }

  $bodyStr = ($http.body | Out-String)
  $snippet = ""
  if ($bodyStr) {
    $snippet = $bodyStr.Substring(0, [Math]::Min(1500, $bodyStr.Length))
  }

  $diag = [ordered]@{
    hasBody           = [bool]($http.body)
    hasParsedJson     = ($null -ne $respObj)
    hasOk             = if ($null -eq $respObj) { $false } else { Has-Prop $respObj 'ok' }
    hasMeta           = if ($null -eq $respObj) { $false } else { Has-Prop $respObj 'meta' }
    hasViolations     = if ($null -eq $respObj) { $false } else { Has-Prop $respObj 'violations' }
    hasKnowledge      = if ($null -eq $respObj) { $false } else { Has-Prop $respObj 'knowledge' }
    hasFinalJsonError = if ($null -eq $respObj) { $false } else { Has-Prop $respObj 'finalJsonError' }
    hasRawJsonError   = if ($null -eq $respObj) { $false } else { Has-Prop $respObj 'rawJsonError' }
    hasError          = if ($null -eq $respObj) { $false } else { Has-Prop $respObj 'error' }
    citationsCount    = if ($null -eq $respObj) { 0 } else { Get-CitationsCount $respObj }
    sources           = if ($null -eq $respObj) {
      @()
    }
    else {
      @(
        @((Get-Prop $respObj 'citationsUsed' @())) |
        ForEach-Object { "$((Get-Prop $_ 'source' ''))" } |
        Where-Object { $_ } |
        Sort-Object -Unique
      )
    }
    finalJsonError    = if ($null -eq $respObj) { $null } else { Get-Prop $respObj 'finalJsonError' }
    rawJsonError      = if ($null -eq $respObj) { $null } else { Get-Prop $respObj 'rawJsonError' }
    violationCodes    = if ($null -eq $respObj -or -not (Has-Prop $respObj 'violations')) {
      @()
    }
    else {
      @(
        @((Get-Prop $respObj 'violations' @())) |
        ForEach-Object { Get-Prop $_ 'code' '' } |
        Where-Object { $_ } |
        Sort-Object -Unique
      )
    }
  }

  $gate = [ordered]@{
    ok                  = ($fails.Count -eq 0)
    stamp               = $stamp
    mode                = $Mode
    baseUrl             = $baseUrl
    port                = $port
    endpoint            = $Endpoint
    minCitations        = $MinCitations
    elapsedMs           = $elapsedMs
    httpStatus          = $status
    diagnostics         = $diag
    responseBodyPath    = $responseJson
    responseBodySnippet = $snippet
    vercelStdout        = $vercelOut
    vercelStderr        = $vercelErr
    error               = ($fails -join '; ')
  }

  ($gate | ConvertTo-Json -Depth 20) | Set-Content -LiteralPath $gateJson -Encoding UTF8

  if (-not $gate.ok) {
    Fail "[e2e-gate] FAIL gateJson=$gateJson error=$($gate.error)" 30
  }

  OkMsg "[e2e-gate] PASS gateJson=$gateJson"
  exit 0
}
finally {
  if (-not $KeepServer) {
    if ($proc -and -not $proc.HasExited) {
      InfoMsg "[e2e-gate] Stopping vercel dev (pid=$($proc.Id))"
      Stop-ProcessTree -ProcessId $proc.Id
    }
  }
  else {
    WarnMsg "[e2e-gate] KeepServer=ON => vercel dev reste actif."
  }
}
