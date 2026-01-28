[CmdletBinding()]
param(
    [string]$RepoRoot = "",
    [string]$SummaryPath = "",
    [ValidateSet("warn", "fail", "off")]
    [string]$Policy = "warn",

    # ✅ Nice-to-have #1 : DBG opt-in
    [switch]$DebugContract,

    [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Info([string]$m) { if (-not $Quiet) { Write-Host "[INFO] $m" -ForegroundColor Cyan } }
function Ok([string]$m) { Write-Host "[OK]  $m" -ForegroundColor Green }
function Warn([string]$m) { Write-Host "[WARN] $m" -ForegroundColor Yellow }
function Err([string]$m) { Write-Host "[ERR] $m" -ForegroundColor Red }

# ✅ DBG n'apparait que si -Verbose OU -DebugContract (et jamais si -Quiet)
function Dbg([string]$m) {
    if ($Quiet) { return }
    if ($DebugContract -or $VerbosePreference -eq "Continue") {
        Write-Host "[DBG] $m" -ForegroundColor DarkGray
    }
}

function Resolve-RepoRoot([string]$RepoRoot, [string]$ScriptDir) {
    if (-not [string]::IsNullOrWhiteSpace($RepoRoot)) {
        return (Resolve-Path -LiteralPath $RepoRoot -ErrorAction Stop).Path
    }
    return (Resolve-Path -LiteralPath (Join-Path $ScriptDir "..\..") -ErrorAction Stop).Path
}

function Try-ReadLatestRunDir([string]$root) {
    $latestTxt = Join-Path $root "audit\latest.txt"
    if (-not (Test-Path -LiteralPath $latestTxt)) { $latestTxt = Join-Path $root "audit\_latest\latest.txt" }
    if (-not (Test-Path -LiteralPath $latestTxt)) { return $null }

    try {
        $p = (Get-Content -LiteralPath $latestTxt -Raw -Encoding UTF8).Trim()
        if ([string]::IsNullOrWhiteSpace($p)) { return $null }
        if (Test-Path -LiteralPath $p) { return $p }
    }
    catch {}
    return $null
}

function Resolve-SummaryPath([string]$root, [string]$explicit) {
    if (-not [string]::IsNullOrWhiteSpace($explicit)) {
        return (Resolve-Path -LiteralPath $explicit -ErrorAction Stop).Path
    }

    $candidates = @(
        (Join-Path $root "audit\_latest\ci\summary.json"), # ✅ now exists after Nice-to-have #2
        (Join-Path $root "audit\_latest\summary.json"),
        (Join-Path $root "audit\latest\ci\summary.json"),
        (Join-Path $root "audit\latest\summary.json")
    )

    foreach ($c in $candidates) {
        if (Test-Path -LiteralPath $c) { return (Resolve-Path -LiteralPath $c).Path }
    }

    $runDir = Try-ReadLatestRunDir $root
    if ($runDir) {
        $s = Join-Path $runDir "summary.json"
        if (Test-Path -LiteralPath $s) { return (Resolve-Path -LiteralPath $s).Path }
    }

    return $null
}

function Add-Issue([System.Collections.Generic.List[object]]$issues, [string]$code, [string]$message, [string]$path = "") {
    $issues.Add([pscustomobject]@{ code = $code; message = $message; path = $path }) | Out-Null
}

function Is-String($v) { return ($null -ne $v -and $v -is [string] -and -not [string]::IsNullOrWhiteSpace($v)) }
function Is-Int($v) { return ($null -ne $v -and ($v -is [int] -or $v -is [long])) }
function Is-Bool($v) { return ($null -ne $v -and $v -is [bool]) }

function In-Set($v, [string[]]$set) {
    if ($null -eq $v) { return $false }
    return ($set -contains [string]$v)
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-RepoRoot $RepoRoot $ScriptDir
Set-Location $root

if ($Policy -eq "off") {
    Ok "verify-analytics-contract: OFF"
    exit 0
}

$summaryPath = Resolve-SummaryPath $root $SummaryPath
if (-not $summaryPath) {
    Err "summary.json introuvable (audit/_latest/... ou latest.txt ou -SummaryPath)."
    if ($Policy -eq "fail") { exit 1 }
    exit 0
}

Info ("summary: {0}" -f $summaryPath)
Dbg ("summaryPath={0}" -f $summaryPath)

$issues = New-Object 'System.Collections.Generic.List[object]'

# Parse JSON (⚠️ ConvertFrom-Json peut typer les dates en DateTime selon la version/culture)
$summary = $null
$rawJson = $null
$timestampJson = $null
try {
    $rawJson = Get-Content -LiteralPath $summaryPath -Raw -Encoding UTF8
    $summary = $rawJson | ConvertFrom-Json -ErrorAction Stop

    # ✅ Option B (contrat clean) : on valide la forme dans le JSON brut (timestamp doit être une string)
    $m = [regex]::Match($rawJson, '"timestamp"\s*:\s*"([^"]*)"')
    if ($m.Success) { $timestampJson = $m.Groups[1].Value }

    Dbg ("timestamp(json)='{0}'" -f $timestampJson)

    # DBG: timestamp après parsing (informative seulement)
    $ts = $null
    $tsType = $null
    try {
        $ts = $summary.timestamp
        if ($null -ne $ts) { $tsType = $ts.GetType().FullName } else { $tsType = "<null>" }
    }
    catch {
        $ts = "<exception>"
        $tsType = "<exception>"
    }
    Dbg ("timestamp(parsed)='{0}' type={1}" -f $ts, $tsType)
}
catch {
    Add-Issue $issues "json.parse" ("summary.json illisible: {0}" -f $_.Exception.Message) $summaryPath
}

# Champs attendus (Phase 0)
if ($summary) {

    if ([string]::IsNullOrWhiteSpace($timestampJson)) {
        Add-Issue $issues "field.timestamp" "timestamp doit être une string JSON non vide (ex: 2026-01-26T23:26:13.0000000+01:00)." "timestamp"
    }

    if (-not (Is-String $summary.runStamp)) { Add-Issue $issues "field.runStamp" "runStamp doit être une string non vide." "runStamp" }
    if (-not (Is-String $summary.repoRoot)) { Add-Issue $issues "field.repoRoot" "repoRoot doit être une string non vide." "repoRoot" }
    if (-not (Is-String $summary.outDir)) { Add-Issue $issues "field.outDir" "outDir doit être une string non vide." "outDir" }
    if (-not (Is-String $summary.runDir)) { Add-Issue $issues "field.runDir" "runDir doit être une string non vide." "runDir" }

    if (-not (Is-Bool $summary.archive)) { Add-Issue $issues "field.archive" "archive doit être bool." "archive" }
    if (-not (Is-Bool $summary.strict)) { Add-Issue $issues "field.strict" "strict doit être bool." "strict" }

    foreach ($p in @("dirtyPolicy", "lintPolicy", "auditPolicy")) {
        if (-not (Is-String $summary.$p)) { Add-Issue $issues ("field.{0}" -f $p) ("{0} doit être une string non vide." -f $p) $p }
    }

    foreach ($s in @("overall", "gateOverall", "auditOverall")) {
        if (-not (In-Set $summary.$s @("OK", "WARN", "ERR"))) {
            Add-Issue $issues ("field.{0}" -f $s) ("{0} doit être OK/WARN/ERR." -f $s) $s
        }
    }

    if (-not (Is-Int $summary.warnCount)) { Add-Issue $issues "field.warnCount" "warnCount doit être int." "warnCount" }
    if (-not (Is-Int $summary.errCount)) { Add-Issue $issues "field.errCount" "errCount doit être int." "errCount" }

    if ($null -eq $summary.steps) {
        Add-Issue $issues "field.steps" "steps manquant." "steps"
    }
    else {
        $arr = @($summary.steps)
        if ($arr.Count -lt 1) { Add-Issue $issues "field.steps.empty" "steps doit contenir au moins 1 élément." "steps" }
        foreach ($st in $arr) {
            if (-not (Is-String $st.Name)) { Add-Issue $issues "steps.name" "Step.Name doit être string." "steps[].Name" }
            if (-not (In-Set $st.Status @("OK", "WARN", "ERR", "SKIP"))) { Add-Issue $issues "steps.status" "Step.Status doit être OK/WARN/ERR/SKIP." "steps[].Status" }
            if (-not (Is-Int $st.ExitCode)) { Add-Issue $issues "steps.exit" "Step.ExitCode doit être int." "steps[].ExitCode" }
            if (-not (Is-Int $st.DurationMs)) { Add-Issue $issues "steps.dur" "Step.DurationMs doit être int." "steps[].DurationMs" }
            if ($null -ne $st.LogPath -and -not ($st.LogPath -is [string])) { Add-Issue $issues "steps.log" "Step.LogPath doit être string si présent." "steps[].LogPath" }
        }
    }

    if (Is-String $summary.gateCore) {
        $gateCorePath = $summary.gateCore
        if (-not (Test-Path -LiteralPath $gateCorePath)) {
            Add-Issue $issues "gateCore.missing" ("gateCore absent: {0}" -f $gateCorePath) "gateCore"
        }
        else {
            try {
                $gc = (Get-Content -LiteralPath $gateCorePath -Raw -Encoding UTF8) | ConvertFrom-Json -ErrorAction Stop
                if ($null -eq $gc.schemaVersion) { Add-Issue $issues "gateCore.schema" "gate-core.json: schemaVersion manquant." $gateCorePath }
            }
            catch {
                Add-Issue $issues "gateCore.parse" ("gate-core.json illisible: {0}" -f $_.Exception.Message) $gateCorePath
            }
        }
    }
    else {
        $fallbackGateCore = Join-Path $root "audit\_latest\ci\gate-core.json"
        if (-not (Test-Path -LiteralPath $fallbackGateCore)) {
            Add-Issue $issues "gateCore.latest.missing" "gate-core.json manquant dans audit/_latest/ci." $fallbackGateCore
        }
    }
}

$reportDir = Split-Path -Parent $summaryPath
$reportPath = Join-Path $reportDir "contract-analytics.json"

$report = [ordered]@{
    timestamp = (Get-Date).ToString("o")
    policy    = $Policy
    summary   = $summaryPath
    ok        = ($issues.Count -eq 0)
    issues    = $issues
}

($report | ConvertTo-Json -Depth 10) | Set-Content -LiteralPath $reportPath -Encoding UTF8
Info ("report: {0}" -f $reportPath)

if ($issues.Count -eq 0) {
    Ok "verify-analytics-contract: OK"
    exit 0
}

Warn ("verify-analytics-contract: {0} issue(s)" -f $issues.Count)
foreach ($i in $issues) {
    Warn ("- {0}: {1}" -f $i.code, $i.message)
}

if ($Policy -eq "fail") { exit 1 }
exit 0
