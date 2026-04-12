[CmdletBinding()]
param(
  [string]$RepoRoot = "",
  [int]$KeepLast = 0,
  [switch]$PurgeDocker
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepoRoot([string]$hint) {
  if ($hint -and (Test-Path -LiteralPath $hint)) { return (Resolve-Path -LiteralPath $hint).Path }
  return (git rev-parse --show-toplevel)
}

$root = Get-RepoRoot $RepoRoot
Set-Location $root

function Stop-MegaLinterContainers {
  try {
    $rows = docker ps --format "{{.ID}}`t{{.Image}}`t{{.Names}}" 2>$null
    $ids = @()
    foreach ($r in $rows) { if ($r -match "(?i)megalinter") { $ids += ($r -split "`t")[0] } }
    if ($ids.Count -gt 0) {
      Write-Host "[INFO] Stopping MegaLinter containers: $($ids -join ', ')" -ForegroundColor Yellow
      docker stop $ids | Out-Null
    } else {
      Write-Host "[INFO] No MegaLinter container running." -ForegroundColor DarkGray
    }
  } catch {
    Write-Host "[WARN] docker indisponible ou non démarré." -ForegroundColor Yellow
  }
}

Stop-MegaLinterContainers

# Nettoyage dossiers “pollution locale”
$paths = @(
  (Join-Path $root "megalinter-reports"),
  (Join-Path $root ".megalinter-reports")
)

foreach ($p in $paths) {
  if (Test-Path -LiteralPath $p) {
    Write-Host "[INFO] Remove $p" -ForegroundColor Yellow
    Remove-Item -Recurse -Force -LiteralPath $p
  }
}

# Nettoyage audit/megalinter (en gardant éventuellement N derniers)
$auditRoot = Join-Path $root "audit/megalinter"
if (Test-Path -LiteralPath $auditRoot) {
  $runs = Get-ChildItem -LiteralPath $auditRoot -Directory | Sort-Object Name -Descending
  $toDelete = if ($KeepLast -gt 0) { $runs | Select-Object -Skip $KeepLast } else { $runs }

  foreach ($d in $toDelete) {
    Write-Host "[INFO] Remove $($d.FullName)" -ForegroundColor Yellow
    Remove-Item -Recurse -Force -LiteralPath $d.FullName
  }
}

if ($PurgeDocker) {
  try {
    Write-Host "[INFO] docker system prune -f" -ForegroundColor Yellow
    docker system prune -f | Out-Null
  } catch {
    Write-Host "[WARN] docker prune impossible." -ForegroundColor Yellow
  }
}

Write-Host "[OK] MegaLinter clean done." -ForegroundColor Green