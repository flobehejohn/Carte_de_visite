[CmdletBinding()]
param(
  [string]$AuditDir = ".\audit",
  [int]$Keep = 3,
  [switch]$WhatIf
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$auditAbs = if ([System.IO.Path]::IsPathRooted($AuditDir)) { $AuditDir } else { Join-Path $RepoRoot $AuditDir }

if (-not (Test-Path -LiteralPath $auditAbs)) {
  Write-Host ("Audit directory not found: {0}" -f $auditAbs)
  exit 0
}

function Remove-RunItem([string]$path) {
  Write-Host ("DEL : {0}" -f $path)
  if (-not $WhatIf) { Remove-Item -LiteralPath $path -Recurse -Force }
}

$categories = Get-ChildItem -LiteralPath $auditAbs -Directory | Where-Object { $_.Name -ne "_latest" }
foreach ($cat in $categories) {
  if ($cat.Name -eq "gate") { continue }
  $dirs = Get-ChildItem -LiteralPath $cat.FullName -Directory | Sort-Object LastWriteTime -Descending
  $i = 0
  foreach ($d in $dirs) {
    $i++
    if ($Keep -gt 0 -and $i -le $Keep) { continue }
    Remove-RunItem $d.FullName
  }
}

$gateDir = Join-Path $auditAbs "gate"
if (Test-Path -LiteralPath $gateDir) {
  $reports = Get-ChildItem -LiteralPath $gateDir -File -Filter "gate-report_*.json" | Sort-Object LastWriteTime -Descending
  $i = 0
  foreach ($r in $reports) {
    $i++
    if ($i -le 1) { continue }
    Remove-RunItem $r.FullName
  }

  $gateDirs = Get-ChildItem -LiteralPath $gateDir -Directory | Sort-Object LastWriteTime -Descending
  $i = 0
  foreach ($d in $gateDirs) {
    $i++
    if ($i -le 1) { continue }
    Remove-RunItem $d.FullName
  }
}
