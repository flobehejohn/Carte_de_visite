# scripts/diag/scrub-artifacts.ps1
[CmdletBinding()]
param(
  [string]$ArtifactsDir = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path 'artifacts'),
  [switch]$InPlace = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Info([string]$m) { Write-Host $m -ForegroundColor Cyan }
function Warn([string]$m) { Write-Host $m -ForegroundColor Yellow }

if (-not (Test-Path -LiteralPath $ArtifactsDir)) {
  Warn "ArtifactsDir introuvable: $ArtifactsDir"
  exit 0
}

# Patterns simples : Vercel token + Google API Key (si jamais)
$rules = @(
  @{ name='vercel_token'; pattern='vcp_[A-Za-z0-9_\-]+'; replace='vcp_[REDACTED]' },
  @{ name='google_api_key'; pattern='AIza[0-9A-Za-z\-_]{20,}'; replace='AIza[REDACTED]' }
)

$files = Get-ChildItem -LiteralPath $ArtifactsDir -Recurse -File -ErrorAction SilentlyContinue
$changed = 0

foreach ($f in $files) {
  $text = $null
  try { $text = Get-Content -LiteralPath $f.FullName -Raw -ErrorAction Stop } catch { continue }
  if (-not $text) { continue }

  $orig = $text
  foreach ($r in $rules) {
    $text = [regex]::Replace($text, $r.pattern, $r.replace)
  }

  if ($text -ne $orig) {
    $changed++
    if ($InPlace) {
      Set-Content -LiteralPath $f.FullName -Value $text -Encoding UTF8
      Info "scrubbed: $($f.FullName)"
    } else {
      Info "would scrub: $($f.FullName)"
    }
  }
}

Info "Done. files_scrubbed=$changed"