# scripts/sarif/summarize-megalinter.ps1
# Résume MegaLinter JSON (+ option SARIF) en KPI diffables.
# - kpi.json : totaux + par linter
# - errors.summary.txt : erreurs uniquement (si SARIF agrégé fourni)

[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ReportDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Ensure-Dir([string]$p) {
    if (-not (Test-Path -LiteralPath $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
}

$reportDirAbs = (Resolve-Path -LiteralPath $ReportDir).Path
$jsonPath = Join-Path $reportDirAbs "mega-linter-report.json"
$sarifPath = Join-Path $reportDirAbs "megalinter-report.sarif"

if (-not (Test-Path -LiteralPath $jsonPath)) {
    throw "mega-linter-report.json introuvable dans: $reportDirAbs"
}

$jr = Get-Content -LiteralPath $jsonPath -Raw -Encoding UTF8 | ConvertFrom-Json

# KPI depuis JSON (fiable, rapide)
$perLinter = @()
$totalErrors = 0
$totalWarnings = 0

foreach ($l in @($jr.linters)) {
    $errors = [int]($l.total_number_errors ?? $l.number_errors ?? 0)
    $warnings = [int]($l.total_number_warnings ?? 0)

    $totalErrors += $errors
    $totalWarnings += $warnings

    $perLinter += [pscustomobject]@{
        name       = [string]$l.name
        descriptor = [string]$l.descriptor_id
        files      = [int]($l.files_number ?? 0)
        errors     = $errors
        warnings   = $warnings
        elapsed_s  = [double]($l.elapsed_time_s ?? 0)
        status     = [string]($l.status ?? "")
    }
}

$kpi = [pscustomobject]@{
    generatedAt = (Get-Date).ToString("o")
    reportDir   = $reportDirAbs
    totals      = @{
        errors   = $totalErrors
        warnings = $totalWarnings
        linters  = @($perLinter).Count
    }
    linters     = $perLinter | Sort-Object -Property errors, warnings -Descending
}

$kpiPath = Join-Path $reportDirAbs "kpi.json"
$kpi | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $kpiPath -Encoding UTF8

# Erreurs détaillées depuis SARIF agrégé (si dispo)
$errorsTxt = Join-Path $reportDirAbs "errors.summary.txt"
if (Test-Path -LiteralPath $sarifPath) {
    $sr = Get-Content -LiteralPath $sarifPath -Raw -Encoding UTF8 | ConvertFrom-Json

    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($run in @($sr.runs)) {
        foreach ($res in @($run.results)) {
            $level = [string]($res.level ?? "warning")
            if ($level -ne "error") { continue }

            $ruleId = [string]($res.ruleId ?? "")
            $msg = [string]($res.message.text ?? "")

            $uri = ""
            $line = ""
            $col = ""
            $loc = $res.locations | Select-Object -First 1
            if ($loc -and $loc.physicalLocation) {
                $uri = [string]($loc.physicalLocation.artifactLocation.uri ?? "")
                $line = [string]($loc.physicalLocation.region.startLine ?? "")
                $col = [string]($loc.physicalLocation.region.startColumn ?? "")
            }

            $lines.Add(("{0}:{1}:{2} [{3}] {4}" -f $uri, $line, $col, $ruleId, $msg).Trim())
        }
    }

    if ($lines.Count -eq 0) {
        "NO_ERROR_IN_SARIF" | Set-Content -LiteralPath $errorsTxt -Encoding UTF8
    }
    else {
        $lines | Sort-Object | Set-Content -LiteralPath $errorsTxt -Encoding UTF8
    }
}
else {
    "SARIF_NOT_FOUND (only KPI from JSON generated)" | Set-Content -LiteralPath $errorsTxt -Encoding UTF8
}

Write-Output "[OK] KPI: $kpiPath"
Write-Output "[OK] Errors: $errorsTxt"
