[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$RepoRoot = "",

    [string]$OutDir = ".\audit\runtime",
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

function Extract-Block([string]$text, [string]$needlePattern) {
    $m = [regex]::Match($text, $needlePattern)
    if (-not $m.Success) { return $null }
    $start = $m.Index
    $brace = 0
    $i = $m.Index
    $foundFirstBrace = $false
    for (; $i -lt $text.Length; $i++) {
        $ch = $text[$i]
        if ($ch -eq "{") { $brace++; $foundFirstBrace = $true }
        elseif ($ch -eq "}") { $brace--; if ($foundFirstBrace -and $brace -eq 0) { break } }
    }
    if (-not $foundFirstBrace -or $brace -ne 0) { return $null }
    $end = $i
    return $text.Substring($start, ($end - $start + 1))
}

try {
    $RepoRoot = Resolve-RepoRoot -RepoRoot $RepoRoot -ScriptDir $ScriptDir
    if (-not $RunStamp -or $RunStamp.Trim() -eq "") { $RunStamp = Now-Stamp }

    $outAbs = Resolve-OutDirAbs -RepoRoot $RepoRoot -OutDir $OutDir -DefaultSubDir ".\audit\runtime"

    $target = Join-Path $RepoRoot "src\scene\RitualOrchestrator.js"
    if (-not (Test-Path $target)) { throw "Fichier manquant: $target" }

    Info "Repo root : $RepoRoot"
    Info "Analyse: $target"

    $text = Get-Content -LiteralPath $target -Raw -Encoding UTF8

    if ($text -match "bloomEndMul") { Err "Reliquat 'bloomEndMul' détecté." }
    else { Ok "Aucun 'bloomEndMul' trouvé." }

    $block = Extract-Block $text "applyTargetsToRuntime\s*\([^)]*\)\s*\{"
    if (-not $block) { Err "Bloc applyTargetsToRuntime introuvable/extraction échouée." }
    else { Ok "Bloc applyTargetsToRuntime extrait." }

    if ($block) {
        $cStrength = Count-Matches $block "ctx\.bloomPass\.(strength)\s*="
        if ($cStrength -eq 1) { Ok "applyTargetsToRuntime: assign bloom strength OK (occurrences: 1)." }
        else { Err "applyTargetsToRuntime: bloom strength assign occurrences=$cStrength (attendu=1)." }

        $cRadius = Count-Matches $block "ctx\.bloomPass\.(radius|blurRadius)\s*="
        if ($cRadius -eq 1) { Ok "applyTargetsToRuntime: bloom radius assign OK (occurrences: 1)." }
        else { Err "applyTargetsToRuntime: bloom radius assign occurrences=$cRadius (attendu=1)." }

        $cThreshold = Count-Matches $block "ctx\.bloomPass\.(threshold)\s*="
        if ($cThreshold -eq 1) { Ok "applyTargetsToRuntime: bloom threshold assign OK (occurrences: 1)." }
        else { Err "applyTargetsToRuntime: bloom threshold assign occurrences=$cThreshold (attendu=1)." }

        $cVolCfg = Count-Matches $block "\bconst\s+volumeCfg\b"
        if ($cVolCfg -eq 1) { Ok "applyTargetsToRuntime: volumeCfg OK (occurrences: 1)." }
        else { Err "applyTargetsToRuntime: volumeCfg occurrences=$cVolCfg (attendu=1)." }

        $cFogNew = Count-Matches $block "new\s+THREE\.FogExp2\s*\("
        if ($cFogNew -eq 1) { Ok "applyTargetsToRuntime: FogExp2 new OK (occurrences: 1)." }
        else { Err "applyTargetsToRuntime: FogExp2 new occurrences=$cFogNew (attendu=1)." }

        if ($block -match "ctx\._fogExp2") { Ok "Fog cache ctx._fogExp2 détecté." }
        else { Err "Fog cache ctx._fogExp2 manquant (attendu)." }
    }

    if ($block) {
        $outside = $text.Replace($block, "")
        $cFogOutside = Count-Matches $outside "new\s+THREE\.FogExp2\s*\("
        if ($cFogOutside -eq 0) { Ok "Pas de FogExp2 new en dehors de applyTargetsToRuntime." }
        else { Err "FogExp2 new détecté hors applyTargetsToRuntime (occurrences=$cFogOutside)." }
    }

    if ($block) {
        $outside = $text.Replace($block, "")
        $cBloomOutside = Count-Matches $outside "bloomPass\.(strength|radius|blurRadius|threshold)\s*="
        if ($cBloomOutside -eq 0) { Ok "Phase1: pas d'écriture bloomPass hors applyTargetsToRuntime." }
        else { Err "Écritures bloomPass hors applyTargetsToRuntime détectées (occurrences=$cBloomOutside)." }
    }

    if ($block -and ($block -match "bloomClamp")) { Ok "Phase1: bloomClamp détecté dans applyTargetsToRuntime." }
    elseif ($block) { Warn "bloomClamp non détecté dans applyTargetsToRuntime (si attendu)." }

    $calls = Count-Matches $text "this\.applyTargetsToRuntime\s*\("
    if ($calls -eq 2) { Ok "Nombre d'appels this.applyTargetsToRuntime(...) = 2 (OK si 2-2)." }
    else { Err "Nombre d'appels this.applyTargetsToRuntime(...) = $calls (attendu=2)." }

    if ($text -match "_climateWireOpacityMul") { Ok "Usage _climateWireOpacityMul détecté." } else { Err "_climateWireOpacityMul manquant." }
    if ($text -match "_climateParticlesOpacityMul") { Ok "Usage _climateParticlesOpacityMul détecté." } else { Err "_climateParticlesOpacityMul manquant." }
    if ($text -match "_climateForegroundOpacity") { Ok "Usage _climateForegroundOpacity détecté." } else { Err "_climateForegroundOpacity manquant." }

    $cExposureAssign = Count-Matches $text "toneMappingExposure\s*="
    if ($cExposureAssign -le 1) { Ok "exposureAssign: toneMappingExposure assign OK (occurrences: $cExposureAssign)." }
    else { Err "exposureAssign: toneMappingExposure assign occurrences=$cExposureAssign (attendu<=1)." }

    $txtPath = Join-Path $outAbs ("runtimeaudit_{0}.txt" -f $RunStamp)
    $jsonPath = Join-Path $outAbs ("runtimeaudit_{0}.json" -f $RunStamp)

    $payload = [ordered]@{
        timestamp = (Get-Date).ToString("o")
        runStamp  = $RunStamp
        repoRoot  = $RepoRoot
        target    = $target
        summary   = [ordered]@{
            warn = $script:WarnCount
            err  = $script:ErrCount
            exit = if ($script:ErrCount -gt 0) { 1 } elseif ($script:WarnCount -gt 0) { 2 } else { 0 }
        }
        logs      = $script:LogLines
    }

    Set-Content -LiteralPath $txtPath -Value ($script:LogLines -join "`r`n") -Encoding UTF8
    ($payload | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $jsonPath -Encoding UTF8

    Copy-Item -Force $txtPath  (Join-Path $outAbs "runtimeaudit-latest.txt")
    Copy-Item -Force $jsonPath (Join-Path $outAbs "runtimeaudit-latest.json")

    Info "Audit runtime log : $txtPath"
    Info "Audit runtime json: $jsonPath"

    Write-Host "`n---- Résumé audit ----"
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
