[CmdletBinding()]
param(
  [string]$AuditDir = ".\audit",
  [int]$KeepDays = 0,
  [int]$KeepLast = 10,
  [switch]$Zip,
  [switch]$WhatIf
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$auditAbs  = if ([System.IO.Path]::IsPathRooted($AuditDir)) { $AuditDir } else { Join-Path $RepoRoot $AuditDir }

if (-not (Test-Path -LiteralPath $auditAbs)) {
  Write-Host "Audit directory not found: $auditAbs"
  exit 0
}

function Get-RunDirs {
  param(
    [string]$BaseDir,
    [string[]]$Prefixes,
    [switch]$AllowTimestamp
  )
  if (-not (Test-Path -LiteralPath $BaseDir)) { return @() }

  $dirs = Get-ChildItem -LiteralPath $BaseDir -Directory | Where-Object { $_.Name -ne "_latest" }

  $dirs = $dirs | Where-Object {
    $name = $_.Name
    $isPrefix = $false
    foreach ($p in $Prefixes) { if ($name -like "$p*") { $isPrefix = $true; break } }

    $isTs = $false
    if ($AllowTimestamp) { $isTs = ($name -match "^\d{8}_\d{6}$") }

    return ($isPrefix -or $isTs)
  }

  return $dirs
}

function Should-Keep {
  param(
    [System.IO.DirectoryInfo]$Dir,
    [Nullable[datetime]]$Cutoff,
    [int]$Rank,
    [int]$KeepLast
  )
  if ($Cutoff.HasValue -and $Dir.LastWriteTime -ge $Cutoff.Value) { return $true }
  if ($KeepLast -gt 0 -and $Rank -le $KeepLast) { return $true }
  return $false
}

$now    = Get-Date
$cutoff = if ($KeepDays -gt 0) { [Nullable[datetime]]$now.AddDays(-$KeepDays) } else { [Nullable[datetime]]$null }

$groups = @(
  @{ Name="VALID"; Base=$auditAbs; Prefixes=@("VALID_","CI_"); AllowTimestamp=$false },
  @{ Name="PH3";   Base=(Join-Path $auditAbs "PH3"); Prefixes=@("PH3_");        AllowTimestamp=$true  }
)

foreach ($g in $groups) {
  $dirs = Get-RunDirs -BaseDir $g.Base -Prefixes $g.Prefixes -AllowTimestamp:([bool]$g.AllowTimestamp) |
          Sort-Object LastWriteTime -Descending

  if (-not $dirs -or $dirs.Count -eq 0) { continue }

  $i = 0
  foreach ($d in $dirs) {
    $i++
    if (Should-Keep -Dir $d -Cutoff $cutoff -Rank $i -KeepLast $KeepLast) { continue }

    $zipPath = "{0}.zip" -f $d.FullName
    if ($Zip) {
      Write-Host ("ZIP : {0} -> {1}" -f $d.FullName, $zipPath)
      if (-not $WhatIf) { Compress-Archive -Path $d.FullName -DestinationPath $zipPath -Force }
    }

    Write-Host ("DEL : {0}" -f $d.FullName)
    if (-not $WhatIf) { Remove-Item -LiteralPath $d.FullName -Recurse -Force }
  }
}
