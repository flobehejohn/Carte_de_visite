[CmdletBinding()]
param(
  [string]$RepoRoot = "",
  [string]$OutDir = "audit/_latest/opacity_sinks",
  [string]$RunStamp = "",
  [int]$Keep = 3,
  [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ScriptDir "_auditRun.ps1")

$script:Quiet = [bool]$Quiet
if ($script:Quiet) { $VerbosePreference = "SilentlyContinue" }

$script:WarnCount = 0
$script:ErrCount = 0
$script:LogLines = New-Object System.Collections.Generic.List[string]

function Log([string]$level, [string]$msg, [ConsoleColor]$color = [ConsoleColor]::Gray) {
  $line = "[$level] $msg"
  $script:LogLines.Add($line) | Out-Null
  if ($script:Quiet) {
    if ($level -ne "INFO") { Write-Host $line -ForegroundColor $color }
    return
  }
  if ($level -eq "INFO") { Write-Verbose $line }
  else { Write-Host $line -ForegroundColor $color }
}
function Info($m) { Log "INFO" $m ([ConsoleColor]::Gray) }
function Ok($m) { Log "OK"   $m ([ConsoleColor]::Green) }
function Warn($m) { $script:WarnCount++; Log "WARN" $m ([ConsoleColor]::Yellow) }
function Err($m) { $script:ErrCount++; Log "ERR"  $m ([ConsoleColor]::Red) }

function Now-Stamp { (Get-Date).ToString("yyyyMMdd_HHmmss") }

function Get-Lines([string]$path) { Get-Content -LiteralPath $path -Encoding UTF8 }
function Get-Context([string[]]$lines, [int]$lineNo, [int]$radius = 30) {
  $i = [Math]::Max(0, $lineNo - 1 - $radius)
  $j = [Math]::Min($lines.Count - 1, $lineNo - 1 + $radius)
  return ($i..$j | ForEach-Object { $lines[$_] }) -join "`n"
}

try {
  $RepoRoot = Resolve-RepoRoot -RepoRoot $RepoRoot -ScriptDir $ScriptDir
  if (-not $RunStamp -or $RunStamp.Trim() -eq "") { $RunStamp = Now-Stamp }

  $category = "opacity_sinks"
  $baseDir = Join-Path $RepoRoot "audit\$category"
  $runDir = Join-Path $baseDir $RunStamp
  $latest = Resolve-OutDirAbs -RepoRoot $RepoRoot -OutDir $OutDir -DefaultSubDir "audit/_latest/$category"
  Ensure-Dir $runDir
  $outAbs = $runDir
  if (-not $script:Quiet) { Write-Host "`n=== audit opacity sinks ===" -ForegroundColor Cyan }
  Info "Repo root : $RepoRoot"

  $all = Get-ChildItem (Join-Path $RepoRoot "src") -Recurse -File -Include *.js, *.ts, *.tsx |
  Where-Object { $_.FullName -notmatch "\\ultimate_orb_files\\" }

  $writePatterns = @(
    'material\.(opacity|transparent|depthWrite)\s*=',
    '\btransparent\s*=\s*',
    '\bdepthWrite\s*=\s*',
    '\bblending\s*=\s*',
    '\brenderOrder\s*=\s*'
  )

  $hits = foreach ($f in $all) {
    foreach ($p in $writePatterns) {
      Select-String -LiteralPath $f.FullName -Pattern $p -ErrorAction SilentlyContinue |
      ForEach-Object {
        [pscustomobject]@{ File = $_.Path; Line = $_.LineNumber; Text = $_.Line.Trim(); Pattern = $p }
      }
    }
  }

  $csv = Join-Path $outAbs "opacity_sinks_hits.csv"
  $hits | Export-Csv -NoTypeInformation -Encoding UTF8 $csv
  Ok "CSV sinks: $csv"

  $WIRE_TOKENS = '(_climateWireOpacityMul|wireMul|opacityMul|applied\.opacity|ctx\.applied)'
  $PART_TOKENS = '(_climateParticlesOpacityMul|particlesMul|opacityMul|applied\.opacity|ctx\.applied)'
  $VEIL_TOKENS = '(_climateForegroundOpacity|veilOpacity|applied\.opacity|this\.applied|ctx\.applied)'

  $wireFile = Join-Path $RepoRoot "src\scene\modules\orbGeometry.js"
  $partFile = Join-Path $RepoRoot "src\scene\modules\orbParticles.js"
  $orchFile = Join-Path $RepoRoot "src\scene\RitualOrchestrator.js"

  if (-not (Test-Path $wireFile)) { Warn "Wire file absent: $wireFile" }
  if (-not (Test-Path $partFile)) { Warn "Particles file absent: $partFile" }
  if (-not (Test-Path $orchFile)) { Warn "Orchestrator absent: $orchFile" }

  function Check-OpacityAssignments([string]$file, [string]$label, [string]$tokenRegex) {
    if (-not (Test-Path $file)) { return }

    $lines = Get-Lines $file
    $assigns = Select-String -LiteralPath $file -Pattern 'material\.opacity\s*=' -ErrorAction SilentlyContinue

    if (-not $assigns) { Ok "$($label): no material.opacity assignments (single-writer OK)"; return }

    foreach ($a in $assigns) {
      $ctx = Get-Context $lines $a.LineNumber 40

      if ($a.Line -match $tokenRegex) { continue }

      if ($a.Line -match 'material\.opacity\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*;' ) {
        $var = $Matches[1]
        if ($ctx -match "(const|let)\s+$var\s*=\s*[\s\S]*$tokenRegex") { continue }
      }

      Err "$($label): assignation opacity non reliée à un mul (ligne $($a.LineNumber)): $($a.Line.Trim())"
    }

    if ($script:ErrCount -eq 0) { Ok "$($label): toutes les assignations opacity semblent reliées à un mul (via contexte)." }
  }

  Check-OpacityAssignments $wireFile "WIRE" $WIRE_TOKENS
  Check-OpacityAssignments $partFile "PARTICLES" $PART_TOKENS

  if (Test-Path $orchFile) {
    $lines = Get-Lines $orchFile
    $veil = Select-String -LiteralPath $orchFile -Pattern 'foregroundMesh\.material\.opacity\s*=' -ErrorAction SilentlyContinue
    foreach ($v in $veil) {
      $ctx = Get-Context $lines $v.LineNumber 40
      if ($v.Line -match $VEIL_TOKENS) { continue }
      if ($ctx -match $VEIL_TOKENS) { continue }
      Err "VEIL: opacity foregroundMesh non reliée à veilOpacity/applied (ligne $($v.LineNumber)): $($v.Line.Trim())"
    }
    if ($veil -and $script:ErrCount -eq 0) { Ok "VEIL: foreground opacity reliée à l'état appliqué." }
    elseif (-not $veil) { Ok "VEIL: no foreground opacity assignments (single-writer OK)" }
  }

  $txtPath = Join-Path $outAbs ("opacity_sinks_{0}.txt" -f $RunStamp)
  $jsonPath = Join-Path $outAbs ("opacity_sinks_{0}.json" -f $RunStamp)

  $summary = [ordered]@{
    exit     = if ($script:ErrCount -gt 0) { 1 } elseif ($script:WarnCount -gt 0) { 2 } else { 0 }
    warn     = $script:WarnCount
    err      = $script:ErrCount
    runStamp = $RunStamp
  }

  $payload = [ordered]@{
    timestamp = (Get-Date).ToString("o")
    repoRoot  = $RepoRoot
    runStamp  = $RunStamp
    summary   = $summary
    csv       = $csv
    logs      = $script:LogLines
  }

  Set-Content -LiteralPath $txtPath -Value ($script:LogLines -join "`r`n") -Encoding UTF8
  ($payload | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $jsonPath -Encoding UTF8
  Info "Audit sinks log : $txtPath"
  Info "Audit sinks json: $jsonPath"
  $latestPath = Write-AuditLatest -Category $category -RunDir $runDir -LatestDir $latest -Keep $Keep
  $exitCode = if ($script:ErrCount -gt 0) { 1 } elseif ($script:WarnCount -gt 0) { 2 } else { 0 }

  if ($exitCode -eq 0) {
    Write-Host ("[OK] audit opacity sinks => {0}" -f $latestPath) -ForegroundColor Green
    exit 0
  }
  if ($exitCode -eq 2) {
    Write-Host ("[OK] audit opacity sinks (warn) => {0}" -f $latestPath) -ForegroundColor Yellow
    exit 2
  }
  Write-Host ("[KO] audit opacity sinks => {0}" -f $latestPath) -ForegroundColor Red
  exit 1
}
catch {
  Err $_.Exception.Message
  exit 1
}
