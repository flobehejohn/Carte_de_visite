[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$RepoRoot = "",

    [string]$OutDir = ".\audit\opacity",
    [string]$RunStamp = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ScriptDir "_auditRun.ps1")

$script:WarnCount = 0
$script:ErrCount = 0
$script:LogLines = New-Object System.Collections.Generic.List[string]

function Log([string]$level, [string]$msg, [ConsoleColor]$color = [ConsoleColor]::Gray) {
    $line = "[$level] $msg"
    $script:LogLines.Add($line) | Out-Null
    Write-Host $line -ForegroundColor $color
}
function Info($m) { Log "INFO" $m ([ConsoleColor]::Gray) }
function Ok($m) { Log "OK"   $m ([ConsoleColor]::Green) }
function Warn($m) { $script:WarnCount++; Log "WARN" $m ([ConsoleColor]::Yellow) }
function Err($m) { $script:ErrCount++; Log "ERR"  $m ([ConsoleColor]::Red) }

function Now-Stamp { (Get-Date).ToString("yyyyMMdd_HHmmss") }

function Count-Matches([string]$text, [string]$pattern) {
    return ([regex]::Matches($text, $pattern)).Count
}

try {
    $RepoRoot = Resolve-RepoRoot -RepoRoot $RepoRoot -ScriptDir $ScriptDir

    if (-not $RunStamp -or $RunStamp.Trim() -eq "") { $RunStamp = Now-Stamp }

    $outAbs = Resolve-OutDirAbs -RepoRoot $RepoRoot -OutDir $OutDir -DefaultSubDir ".\audit\opacity"

    $orchPath = Join-Path $RepoRoot "src\scene\RitualOrchestrator.js"
    if (-not (Test-Path $orchPath)) { throw "Fichier manquant: $orchPath" }

    Info "Repo root : $RepoRoot"
    Info "Analyse: $orchPath"

    $text = Get-Content -LiteralPath $orchPath -Raw -Encoding UTF8

    $tWire = Count-Matches $text "_climateWireOpacityMul"
    $tPart = Count-Matches $text "_climateParticlesOpacityMul"
    $tFore = Count-Matches $text "_climateForegroundOpacity"

    $aWire = Count-Matches $text "_climateWireOpacityMul\s*="
    $aPart = Count-Matches $text "_climateParticlesOpacityMul\s*="
    $aFore = Count-Matches $text "_climateForegroundOpacity\s*="

    $uWire = [Math]::Max(0, $tWire - $aWire)
    $uPart = [Math]::Max(0, $tPart - $aPart)
    $uFore = [Math]::Max(0, $tFore - $aFore)

    if ($tWire -lt 1) { Err "Aucune occurrence _climateWireOpacityMul trouvée." }
    elseif ($uWire -lt 1) { Err "_climateWireOpacityMul trouvé mais jamais LU (usage) hors assignation." }
    else { Ok "_climateWireOpacityMul: usage détecté (total=$tWire, assign=$aWire, usage=$uWire)." }

    if ($tPart -lt 1) { Err "Aucune occurrence _climateParticlesOpacityMul trouvée." }
    elseif ($uPart -lt 1) { Err "_climateParticlesOpacityMul trouvé mais jamais LU (usage) hors assignation." }
    else { Ok "_climateParticlesOpacityMul: usage détecté (total=$tPart, assign=$aPart, usage=$uPart)." }

    if ($tFore -lt 1) { Err "Aucune occurrence _climateForegroundOpacity trouvée." }
    elseif ($uFore -lt 1) { Err "_climateForegroundOpacity trouvé mais jamais LU (usage) hors assignation." }
    else { Ok "_climateForegroundOpacity: usage détecté (total=$tFore, assign=$aFore, usage=$uFore)." }

    $txtPath = Join-Path $outAbs ("opacityaudit_{0}.txt" -f $RunStamp)
    $jsonPath = Join-Path $outAbs ("opacityaudit_{0}.json" -f $RunStamp)

    $summary = [ordered]@{
        exit     = if ($script:ErrCount -gt 0) { 1 } elseif ($script:WarnCount -gt 0) { 2 } else { 0 }
        warn     = $script:WarnCount
        err      = $script:ErrCount
        runStamp = $RunStamp
        target   = $orchPath
    }

    $checks = @(
        [ordered]@{ id = "wireMulUsage"; total = $tWire; assign = $aWire; usage = $uWire; ok = ($uWire -ge 1) },
        [ordered]@{ id = "particlesMulUsage"; total = $tPart; assign = $aPart; usage = $uPart; ok = ($uPart -ge 1) },
        [ordered]@{ id = "foregroundOpacityUsage"; total = $tFore; assign = $aFore; usage = $uFore; ok = ($uFore -ge 1) }
    )

    $payload = [ordered]@{
        timestamp = (Get-Date).ToString("o")
        repoRoot  = $RepoRoot
        runStamp  = $RunStamp
        summary   = $summary
        checks    = $checks
        logs      = $script:LogLines
    }

    Set-Content -LiteralPath $txtPath -Value ($script:LogLines -join "`r`n") -Encoding UTF8
    ($payload | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $jsonPath -Encoding UTF8

    Copy-Item -Force $txtPath (Join-Path $outAbs "opacityaudit-latest.txt")
    Copy-Item -Force $jsonPath (Join-Path $outAbs "opacityaudit-latest.json")

    Info "Audit opacity log : $txtPath"
    Info "Audit opacity json: $jsonPath"

    Write-Host "`n---- Résumé audit opacity ----"
    Write-Host ("WARN: {0}" -f $script:WarnCount)
    Write-Host ("ERR : {0}" -f $script:ErrCount)

    if ($script:ErrCount -gt 0) { exit 1 }
    if ($script:WarnCount -gt 0) { exit 2 }
    exit 0
}
catch {
    Err $_.Exception.Message
    exit 1
}
