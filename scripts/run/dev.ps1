# scripts/run/dev.ps1
[CmdletBinding()]
param(
  [ValidateSet('vite', 'vercel', 'unified')]
  [string]$Mode = 'vercel',

  [int]$Port = 3000,
  [string]$BindHost = '127.0.0.1',

  [int]$WebPort = 5173,
  [string]$WebHost = '127.0.0.1',

  [switch]$AutoPort,
  [int]$PortStart = 3000,
  [int]$PortEnd = 3999,

  [switch]$VercelCliDebug
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Fail([string]$msg, [int]$code = 1) { Write-Host $msg -ForegroundColor Red; exit $code }
function WarnMsg([string]$msg) { Write-Host $msg -ForegroundColor Yellow }
function InfoMsg([string]$msg) { Write-Host $msg -ForegroundColor Cyan }
function OkMsg([string]$msg) { Write-Host $msg -ForegroundColor Green }

function Ensure-Dir([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) {
    New-Item -ItemType Directory -Force -Path $path | Out-Null
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
        $_.LocalAddress -eq '127.0.0.1' -or
        $_.LocalAddress -eq '0.0.0.0' -or
        $_.LocalAddress -eq '::'
      )
    }
  )
}

function Ensure-PortFree {
  param([int]$p, [string]$h)
  $list = @(Get-Listening -p $p -h $h)
  if ($list.Length -gt 0) {
    $pids = ($list | Select-Object -ExpandProperty OwningProcess -Unique) -join ','
    throw ('Port {0}:{1} déjà occupé. PID(s): {2}' -f $h, $p, $pids)
  }
}

function Find-FreePort {
  param([int]$from, [int]$to, [string]$h)
  for ($p = $from; $p -le $to; $p++) {
    if (@(Get-Listening -p $p -h $h).Length -eq 0) { return $p }
  }
  throw ('Aucun port libre trouvé dans [{0}..{1}] sur {2}' -f $from, $to, $h)
}

function Resolve-VercelLauncher {
  $cmd = Get-Command 'vercel.cmd' -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.CommandType -eq 'Application') { return $cmd.Source }
  $exe = Get-Command 'vercel.exe' -ErrorAction SilentlyContinue
  if ($exe -and $exe.CommandType -eq 'Application') { return $exe.Source }
  return 'vercel'
}

function Resolve-PwshLauncher {
  $pwsh = Get-Command 'pwsh.exe' -ErrorAction SilentlyContinue
  if ($pwsh -and $pwsh.CommandType -eq 'Application') { return $pwsh.Source }
  $pwshCmd = Get-Command 'pwsh' -ErrorAction SilentlyContinue
  if ($pwshCmd -and $pwshCmd.CommandType -eq 'Application') {
    return $pwshCmd.Source
  }
  $powershell = Get-Command 'powershell.exe' -ErrorAction SilentlyContinue
  if ($powershell -and $powershell.CommandType -eq 'Application') {
    return $powershell.Source
  }
  return 'pwsh'
}

function Try-BootstrapLocalSecrets([string]$rootPath) {
  $secretsPath = Join-Path $rootPath 'scripts\diag\secrets.local.ps1'
  if (-not (Test-Path -LiteralPath $secretsPath)) {
    return [pscustomobject]@{
      loaded = $false
      path   = $secretsPath
      reason = 'missing'
    }
  }

  try {
    . $secretsPath
    $token = [string]($env:VERCEL_TOKEN)
    $hasToken = -not [string]::IsNullOrWhiteSpace($token)
    return [pscustomobject]@{
      loaded = $hasToken
      path   = $secretsPath
      reason = if ($hasToken) { 'ok' } else { 'no_token_in_script' }
    }
  } catch {
    return [pscustomobject]@{
      loaded = $false
      path   = $secretsPath
      reason = 'exception'
      error  = $_.Exception.Message
    }
  }
}

function MaskSecret([string]$s) {
  if (-not $s) { return "<empty>" }
  $s = $s.Trim()
  if ($s.Length -le 8) { return ('*' * $s.Length) }
  $h = $s.Substring(0, 4)
  $t = $s.Substring($s.Length - 4)
  return "$h****$t (len=$($s.Length))"
}

function Redact-ArgsForLog([string[]]$args) {
  $out = New-Object 'System.Collections.Generic.List[string]'
  for ($i = 0; $i -lt $args.Length; $i++) {
    $a = [string]$args[$i]

    if ($a -eq '--token') {
      $out.Add('--token')
      if ($i + 1 -lt $args.Length) {
        $out.Add((MaskSecret ([string]$args[$i + 1])))
        $i++
      }
      continue
    }

    if ($a -match '^vcp_[A-Za-z0-9]') {
      $out.Add((MaskSecret $a))
      continue
    }

    $out.Add($a)
  }
  return ($out -join ' ')
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

    $match = [regex]::Match($line, '^(?:export\s+)?(?<k>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?<v>.*)$')
    if (-not $match.Success) { continue }

    $key = $match.Groups['k'].Value
    $val = $match.Groups['v'].Value.Trim()
    if (-not $val) {
      $map[$key] = ''
      continue
    }

    $isDoubleQuoted = $val.Length -ge 2 -and $val.StartsWith('"') -and $val.EndsWith('"')
    $isSingleQuoted = $val.Length -ge 2 -and $val.StartsWith("'") -and $val.EndsWith("'")
    if ($isDoubleQuoted -or $isSingleQuoted) {
      $val = $val.Substring(1, $val.Length - 2)
    } else {
      $commentIx = $val.IndexOf(' #')
      if ($commentIx -ge 0) { $val = $val.Substring(0, $commentIx).Trim() }
    }

    $map[$key] = $val
  }

  return $map
}

function Resolve-ApiKeyContext([string]$rootPath) {
  $names = @('GEMINI_API_KEY', 'GOOGLE_API_KEY')

  foreach ($name in $names) {
    $value = Get-EnvVarValue -name $name
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return [pscustomobject]@{
        name   = $name
        value  = $value
        source = ("process-env:{0}" -f $name)
      }
    }
  }

  $envFiles = @(
    [pscustomobject]@{ label = '.vercel/.env.development.local'; path = (Join-Path $rootPath '.vercel\.env.development.local') },
    [pscustomobject]@{ label = '.env.local'; path = (Join-Path $rootPath '.env.local') },
    [pscustomobject]@{ label = '.env.development.local'; path = (Join-Path $rootPath '.env.development.local') }
  )

  foreach ($file in $envFiles) {
    if (-not (Test-Path -LiteralPath $file.path)) { continue }
    $map = Read-DotEnvMap -path $file.path
    foreach ($name in $names) {
      if (-not $map.ContainsKey($name)) { continue }
      $value = [string]$map[$name]
      if ([string]::IsNullOrWhiteSpace($value)) { continue }

      Set-Item -Path ("Env:{0}" -f $name) -Value $value
      return [pscustomobject]@{
        name   = $name
        value  = $value
        source = $file.label
      }
    }
  }

  return [pscustomobject]@{
    name   = $null
    value  = $null
    source = $null
  }
}

# Repo root
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repoRoot

if ($Mode -eq 'unified') {
  $pwshPath = Resolve-PwshLauncher
  $selfPath = $PSCommandPath
  $apiArgs = @(
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    $selfPath,
    '-Mode',
    'vercel',
    '-BindHost',
    $BindHost,
    '-Port',
    "$Port"
  )

  if ($AutoPort) {
    $apiArgs += @('-AutoPort', '-PortStart', "$PortStart", '-PortEnd', "$PortEnd")
  }

  InfoMsg ('[dev] unified starting api=http://{0}:{1} web=http://{2}:{3}' -f $BindHost, $Port, $WebHost, $WebPort)
  $apiProc = Start-Process -FilePath $pwshPath -ArgumentList $apiArgs -WorkingDirectory $repoRoot -PassThru
  Start-Sleep -Seconds 2

  if ($apiProc.HasExited) {
    Fail ('[dev] FAIL: backend process exited immediately (pid={0}, code={1}). Run "npm run dev:vercel" for details.' -f $apiProc.Id, $apiProc.ExitCode)
  }

  InfoMsg ('[dev] backend pid={0} launched in a separate shell' -f $apiProc.Id)
  InfoMsg ('[dev] starting vite on http://{0}:{1}' -f $WebHost, $WebPort)

  & npx vite --host $WebHost --port $WebPort --strictPort
  exit $LASTEXITCODE
}

if ($AutoPort) { $Port = Find-FreePort -from $PortStart -to $PortEnd -h $BindHost }
else { Ensure-PortFree -p $Port -h $BindHost }

$baseUrl = ('http://{0}:{1}' -f $BindHost, $Port)
InfoMsg ('[dev] mode={0} bindHost={1} port={2} repo={3}' -f $Mode, $BindHost, $Port, $repoRoot)
OkMsg   ('[dev] url={0}' -f $baseUrl)

$env:PORT = "$Port"

if ($Mode -eq 'vite') {
  & npm run dev
  exit $LASTEXITCODE
}

$apiKey = Resolve-ApiKeyContext -rootPath $repoRoot
if ($null -ne $apiKey.value -and -not [string]::IsNullOrWhiteSpace([string]$apiKey.value)) {
  InfoMsg ("[dev] apiKey={0} source={1} value={2}" -f $apiKey.name, $apiKey.source, (MaskSecret ([string]$apiKey.value)))
  if ($apiKey.name -eq 'GEMINI_API_KEY' -and -not [string]::IsNullOrWhiteSpace((Get-EnvVarValue -name 'GOOGLE_API_KEY'))) {
    Remove-Item Env:GOOGLE_API_KEY -ErrorAction SilentlyContinue
    InfoMsg '[dev] cleared GOOGLE_API_KEY for this local process; GEMINI_API_KEY remains authoritative'
  }
} else {
  WarnMsg "[dev] WARN: no GEMINI_API_KEY/GOOGLE_API_KEY found in process env or local files (.vercel/.env.development.local, .env.local, .env.development.local). /api/gemini may return MISSING_API_KEY."
}

$vercelPath = Resolve-VercelLauncher
$gc = Join-Path $repoRoot '.vercel-global'
Ensure-Dir $gc

# Token optionnel : best-effort + fallback login
$token = (($env:VERCEL_TOKEN ?? '') + '').Trim()
$useToken = $false

if ($token) {
  InfoMsg ("[dev] token=" + (MaskSecret $token))
  $out = & $vercelPath whoami --token $token 2>&1
  if ($LASTEXITCODE -eq 0) {
    $useToken = $true
  } else {
    WarnMsg ("[dev] WARN: VERCEL_TOKEN invalide => fallback vercel login. whoami dit:`n$out")
    $useToken = $false
    $token = ""
    Remove-Item Env:VERCEL_TOKEN -ErrorAction SilentlyContinue
  }
}

if (-not $useToken) {
  $out2 = & $vercelPath whoami 2>&1
  if ($LASTEXITCODE -ne 0) {
    $boot = Try-BootstrapLocalSecrets -rootPath $repoRoot
    if ($boot.loaded) {
      InfoMsg "[dev] bootstrap token from scripts/diag/secrets.local.ps1"
      $token = (($env:VERCEL_TOKEN ?? '') + '').Trim()
      if ($token) {
        $out3 = & $vercelPath whoami --token $token 2>&1
        if ($LASTEXITCODE -eq 0) {
          $useToken = $true
        } else {
          WarnMsg ("[dev] WARN: token chargé depuis secrets.local.ps1 invalide. whoami dit:`n$out3")
          $token = ''
          Remove-Item Env:VERCEL_TOKEN -ErrorAction SilentlyContinue
        }
      }
    } elseif ($boot.reason -eq 'exception') {
      WarnMsg ("[dev] WARN: impossible de charger secrets.local.ps1 (`n$($boot.error)`n)")
    }
  }
}

if (-not $useToken) {
  $out4 = & $vercelPath whoami 2>&1
  if ($LASTEXITCODE -ne 0) {
    Fail ("[dev] FAIL: pas de token valide et pas de session vercel login. Fais: vercel login, définis VERCEL_TOKEN valide, ou charge scripts/diag/secrets.local.ps1`nwhoami dit:`n$out4") 4
  }
}

$listen = ('{0}:{1}' -f $BindHost, $Port)

# Args Vercel
$args = @('dev', '--yes', '--listen', $listen, '--cwd', $repoRoot)

# IMPORTANT :
# - en mode token : on garde --global-config isolé
# - en mode login : on N’IMPOSE PAS --global-config (sinon creds introuvables dans .vercel-global)
$forceGc = ((($env:VERCEL_FORCE_GLOBAL_CONFIG ?? '') + '').Trim())
if ($useToken) {
  $args += @('--token', $token, '--global-config', $gc)
} elseif ($forceGc -eq '1') {
  $args += @('--global-config', $gc)
}

if ($VercelCliDebug) { $args = @('--debug') + $args }

InfoMsg ("[dev] cmd=$vercelPath " + (Redact-ArgsForLog $args))
& $vercelPath @args
exit $LASTEXITCODE
