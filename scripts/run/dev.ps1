# scripts/run/dev.ps1
[CmdletBinding()]
param(
  [ValidateSet('vite', 'vercel')]
  [string]$Mode = 'vercel',

  [int]$Port = 3000,
  [string]$BindHost = '127.0.0.1',

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

# Repo root
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repoRoot

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
    Fail ("[dev] FAIL: pas de token valide et pas de session vercel login. Fais: vercel login`nwhoami dit:`n$out2") 4
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