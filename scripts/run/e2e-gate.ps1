[CmdletBinding()]
param(
  [string]$BindHost = "127.0.0.1",
  [int]$PortStart = 3001,
  [int]$PortEnd = 3999,
  [int]$StartupTimeoutSec = 45,
  [int]$TimeoutSec = 45,
  [int]$MinCitations = 2,
  [string]$Prompt = "Rituel: prouve que tu utilises le corpus Zarathoustra. Cite au moins 2 extraits.",
  [string]$Endpoint = "/api/gemini",
  [switch]$KeepServer,
  [switch]$StrictJson = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Fail([string]$msg, [int]$code = 1) { Write-Host $msg -ForegroundColor Red; exit $code }
function OkMsg([string]$msg) { Write-Host $msg -ForegroundColor Green }
function WarnMsg([string]$msg) { Write-Host $msg -ForegroundColor Yellow }
function InfoMsg([string]$msg) { Write-Host $msg -ForegroundColor Cyan }

function Ensure-Dir([string]$path) { if (-not (Test-Path -LiteralPath $path)) { New-Item -ItemType Directory -Force -Path $path | Out-Null } }

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
    if (@(Get-Listening -p $p -h $h).Length -eq 0) { return $p }
  }
  throw "Aucun port libre trouvé dans [$from..$to] sur $h"
}

function Stop-ProcessTree([int]$ProcessId) {
  if ($KeepServer) { return }
  if ($IsWindows) {
    try { & taskkill /PID $ProcessId /T /F | Out-Null } catch { }
    try { Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue } catch { }
  } else {
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Get-Bool($v) {
  if ($null -eq $v) { return $false }
  if ($v -is [bool]) { return $v }
  $s = "$v".Trim().ToLowerInvariant()
  return ($s -eq "1" -or $s -eq "true" -or $s -eq "yes")
}

function Get-CitationsCount($respObj) {
  try {
    if ($null -ne $respObj.json -and $null -ne $respObj.json.citations) {
      return @($respObj.json.citations).Count
    }
    if ($null -ne $respObj.citationsUsed) {
      return @($respObj.citationsUsed).Count
    }
  } catch { }
  return 0
}

function Invoke-GeminiOracle([string]$baseUrl, [string]$endpoint, [string]$prompt, [int]$timeoutSec, [string]$traceId) {
  $uri = "$baseUrl$endpoint"

  $bodyObj = [ordered]@{
    traceId       = $traceId
    mode          = "oracle"
    prompt        = $prompt
    expectJson    = $true
    wantCitations = $true
  }

  $bodyJson = ($bodyObj | ConvertTo-Json -Depth 10)

  # ✅ PS7 : empêche l'exception sur 4xx/5xx
  $resp = Invoke-WebRequest -Method Post -Uri $uri -ContentType "application/json" `
    -TimeoutSec $timeoutSec -Body $bodyJson -SkipHttpErrorCheck

  $status = [int]$resp.StatusCode
  $content = $resp.Content

  if (-not $content) {
    return [pscustomobject]@{ httpStatus = $status; body = $null; parsed = $null }
  }

  $parsed = $null
  try { $parsed = ($content | ConvertFrom-Json -Depth 60) } catch { $parsed = $null }

  return [pscustomobject]@{ httpStatus = $status; body = $content; parsed = $parsed }
}

function Resolve-VercelAuth {
  # Renvoie "token" | "login"
  $token = ($env:VERCEL_TOKEN ?? "").Trim()
  if ($token) {
    & vercel whoami --token $token *> $null
    if ($LASTEXITCODE -eq 0) { return "token" }

    WarnMsg "[e2e-gate] WARN: VERCEL_TOKEN invalide => fallback sur vercel login local"
    Remove-Item Env:VERCEL_TOKEN -ErrorAction SilentlyContinue
  }

  & vercel whoami *> $null
  if ($LASTEXITCODE -eq 0) { return "login" }

  Fail "[e2e-gate] FAIL: Vercel non authentifié. Fais 'vercel login' OU définis VERCEL_TOKEN valide." 4
  return "login"
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $RepoRoot

$authMode = Resolve-VercelAuth
InfoMsg "[e2e-gate] Vercel auth mode=$authMode"

$port = Find-FreePort -from $PortStart -to $PortEnd -h $BindHost
$baseUrl = "http://$BindHost`:$port"

$stamp = "E2E_{0:yyyyMMdd_HHmmss}" -f (Get-Date)
$artifactDir = Join-Path $RepoRoot "artifacts"
Ensure-Dir $artifactDir

$vercelOut = Join-Path $artifactDir "vercel-dev.$stamp.out.log"
$vercelErr = Join-Path $artifactDir "vercel-dev.$stamp.err.log"
$gateJson  = Join-Path $artifactDir "gate.$stamp.json"

InfoMsg "[e2e-gate] Starting vercel dev on $baseUrl (stamp=$stamp)"

$env:PORT = "$port"
$proc = $null

try {
  # Start dev.ps1 en background
  $devScript = Join-Path $RepoRoot "scripts\run\dev.ps1"
  $proc = Start-Process -FilePath "pwsh" -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass",
    "-File", $devScript,
    "-Mode", "vercel",
    "-Port", "$port",
    "-BindHost", $BindHost
  ) -WorkingDirectory $RepoRoot -NoNewWindow -PassThru `
    -RedirectStandardOutput $vercelOut -RedirectStandardError $vercelErr

  # Wait listen
  $deadline = (Get-Date).AddSeconds($StartupTimeoutSec)
  while ((Get-Date) -lt $deadline) {
    # ✅ PATCH: afficher stdout/stderr tail si vercel dev quitte
    if ($proc.HasExited) {
      $errTail = ""
      if (Test-Path $vercelErr) { $errTail = (Get-Content $vercelErr -Tail 180 | Out-String) }
      $outTail = ""
      if (Test-Path $vercelOut) { $outTail = (Get-Content $vercelOut -Tail 80 | Out-String) }
      Fail "[e2e-gate] FAIL: vercel dev quitté (exit=$($proc.ExitCode)).`n--- stdout tail ---`n$outTail`n--- stderr tail ---`n$errTail" 6
    }

    if (@(Get-Listening -p $port -h $BindHost).Length -gt 0) { break }
    Start-Sleep -Milliseconds 250
  }

  if (@(Get-Listening -p $port -h $BindHost).Length -eq 0) {
    Fail "[e2e-gate] FAIL: timeout démarrage vercel dev" 7
  }

  InfoMsg "[e2e-gate] Server is listening on $baseUrl"

  $traceId = "gate_$stamp"
  $t0 = Get-Date
  $http = Invoke-GeminiOracle -baseUrl $baseUrl -endpoint $Endpoint -prompt $Prompt -timeoutSec $TimeoutSec -traceId $traceId
  $elapsedMs = [int]((Get-Date) - $t0).TotalMilliseconds

  $status = [int]$http.httpStatus
  $respObj = $http.parsed

  $fails = @()
  if ($status -ne 200) { $fails += "httpStatus=$status" }

  if ($respObj -eq $null) {
    $fails += "response_not_json"
  } else {
    if (-not (Get-Bool $respObj.ok)) {
      try { $fails += "api_ok=false code=$($respObj.error.code)" } catch { $fails += "api_ok=false" }
    }

    $citCount = Get-CitationsCount $respObj
    if ($citCount -lt $MinCitations) { $fails += "citations<$MinCitations (got=$citCount)" }

    $jsonError = $null
    try { $jsonError = $respObj.jsonError } catch { $jsonError = $null }
    if ($null -ne $jsonError -and "$jsonError" -ne "") { $fails += "jsonError=$jsonError" }

    $raw = $null
    try { $raw = $respObj.raw } catch { $raw = $null }

    $repaired = $false; $fallback = $false; $retryCount = 0
    try { $repaired = Get-Bool $raw.repaired } catch { }
    try { $fallback = Get-Bool $raw.fallback } catch { }
    try { $retryCount = [int]($raw.retryCount) } catch { }

    if ($StrictJson) {
      if ($repaired) { $fails += "repaired=1" }
      if ($fallback) { $fails += "fallback=1" }
    }
  }

  $bodyStr = ($http.body | Out-String)
  $snippet = ""
  if ($bodyStr) { $snippet = $bodyStr.Substring(0, [Math]::Min(1200, $bodyStr.Length)) }

  $gate = [ordered]@{
    ok = ($fails.Count -eq 0)
    stamp = $stamp
    baseUrl = $baseUrl
    port = $port
    endpoint = $Endpoint
    strictJson = [bool]$StrictJson
    minCitations = $MinCitations
    elapsedMs = $elapsedMs
    httpStatus = $status
    responseBodySnippet = $snippet
    vercelStdout = $vercelOut
    vercelStderr = $vercelErr
    error = ($fails -join "; ")
  }

  ($gate | ConvertTo-Json -Depth 10) | Set-Content -LiteralPath $gateJson -Encoding UTF8

  if (-not $gate.ok) { Fail "[e2e-gate] FAIL gateJson=$gateJson error=$($gate.error)" 30 }

  OkMsg "[e2e-gate] PASS gateJson=$gateJson"
  exit 0
}
finally {
  if (-not $KeepServer) {
    if ($proc -and -not $proc.HasExited) {
      InfoMsg "[e2e-gate] Stopping vercel dev (pid=$($proc.Id))"
      Stop-ProcessTree -ProcessId $proc.Id
    }
  } else {
    WarnMsg "[e2e-gate] KeepServer=ON => vercel dev reste actif."
  }
}