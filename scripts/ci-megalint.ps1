# scripts/ci-megalint.ps1
# Lancement MegaLinter (Docker) avec presets modulaires + ledger d'artefacts
# Usage (recommandé) :
#   pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\ci-megalint.ps1 -Preset 00-hygiene
#   pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\ci-megalint.ps1 -Preset 04-full -Mode local -RunStamp MEGALINT_20260125_120000
#   # Full ciblé (valide la chaîne SARIF) — IMPORTANT: -Files doit être le DERNIER argument
#   pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\ci-megalint.ps1 `
#     -Preset 04-full -Mode local -RunStamp $stamp `
#     -Files src/scene/safety/LightSafetyGovernor.ts src/components/App.tsx
#
# Notes :
# - En Phase 0 (DISABLE_ERRORS=true), MegaLinter renvoie exit=0 même s'il trouve des erreurs.
# - Si tu fournis -Files, on injecte MEGALINTER_FILES_TO_LINT (liste CSV) pour un run ciblé.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$Preset,

    [Parameter()]
    [ValidateSet("local", "ci")]
    [string]$Mode = "local",

    [Parameter()]
    [string]$RunStamp,

    # IMPORTANT: quand tu appelles via "pwsh -File ...", un @('a','b') est EXPANSÉ
    # en plusieurs arguments. ValueFromRemainingArguments permet de récupérer tout le lot.
    # => mets -Files en dernier.
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Files
)

function Now-Stamp { (Get-Date).ToString("yyyyMMdd_HHmmss") }

function Write-Log {
    param(
        [Parameter(Mandatory)][ValidateSet("INFO", "WARN", "ERR", "DBG")][string]$Level,
        [Parameter(Mandatory)][string]$Message
    )
    $prefix = "[ci-megalint][$Level]"
    switch ($Level) {
        "ERR" { Write-Error "$prefix $Message" }
        "WARN" { Write-Warning "$prefix $Message" }
        default { Write-Output "$prefix $Message" }
    }
}

function Ensure-Dir {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) { throw "Ensure-Dir: Path vide" }
    if (-not (Test-Path -LiteralPath $Path)) {
        $null = New-Item -ItemType Directory -Path $Path -Force
    }
    return (Resolve-Path -LiteralPath $Path).Path
}

function Normalize-PresetName([string]$p) {
    $p2 = ($p ?? "").Trim()
    if ($p2.EndsWith(".yml")) { return $p2.Substring(0, $p2.Length - 4) }
    if ($p2.EndsWith(".yaml")) { return $p2.Substring(0, $p2.Length - 5) }
    return $p2
}

function Split-CsvParts([string]$s) {
    if ([string]::IsNullOrWhiteSpace($s)) { return @() }
    return @($s.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

function Resolve-RepoRoot {
    $root = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
    return $root.Path
}

function Resolve-FilesToLint {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter()][string[]]$Raw
    )

    if (-not $Raw -or $Raw.Count -eq 0) { return @() }

    $acc = New-Object System.Collections.Generic.List[string]
    foreach ($item in $Raw) {
        foreach ($part in (Split-CsvParts $item)) {
            $p = $part.Trim('"').Trim("'")
            if ([string]::IsNullOrWhiteSpace($p)) { continue }

            # Accepte / et \, relatif ou absolu
            $candidate = $p.Replace("/", "\")
            $full = $candidate
            if (-not [System.IO.Path]::IsPathRooted($candidate)) {
                $full = Join-Path $RepoRoot $candidate
            }

            if (-not (Test-Path -LiteralPath $full)) {
                throw "Fichier introuvable (repo-root relatif attendu) : $p"
            }

            $resolved = (Resolve-Path -LiteralPath $full).Path
            $rel = [System.IO.Path]::GetRelativePath($RepoRoot, $resolved)
            $relPosix = $rel.Replace("\", "/")
            $acc.Add($relPosix)
        }
    }

    return $acc.ToArray() | Sort-Object -Unique
}

function Assert-Command([string]$name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "Commande introuvable: $name (installe-la / vérifie PATH)"
    }
}

# ----------------------------
# Main
# ----------------------------
Assert-Command "docker"

$repoRoot = Resolve-RepoRoot
if ([string]::IsNullOrWhiteSpace($RunStamp)) {
    $RunStamp = ("MEGALINT_{0}" -f (Now-Stamp))
}
$presetName = Normalize-PresetName $Preset

$presetHostPath = Join-Path $repoRoot (".megalinter\presets\{0}.yml" -f $presetName)
if (-not (Test-Path -LiteralPath $presetHostPath)) {
    throw "Preset introuvable: $presetHostPath"
}

$outHost = Ensure-Dir (Join-Path $repoRoot (Join-Path "audit\megalinter" $RunStamp))

$filesToLint = Resolve-FilesToLint -RepoRoot $repoRoot -Raw $Files
if ($filesToLint.Count -gt 0) {
    Write-Log INFO ("Run ciblé: {0} fichier(s)" -f $filesToLint.Count)
    $filesCsv = ($filesToLint -join ",")
}
else {
    $filesCsv = ""
}

# Image MegaLinter (pin v9 pour stabilité ; override via env si besoin)
$image = $env:MEGALINTER_IMAGE
if ([string]::IsNullOrWhiteSpace($image)) { $image = "oxsecurity/megalinter:v9" }

Write-Log INFO "RepoRoot  : $repoRoot"
Write-Log INFO "Preset    : $presetName"
Write-Log INFO "PresetPath: $presetHostPath"
Write-Log INFO "RunStamp  : $RunStamp"
Write-Log INFO "Reports   : $outHost"
Write-Log INFO "Image     : $image"

# Construit docker args en tableau (évite les soucis de quoting)
$dockerArgs = @(
    "run", "--rm",
    "-v", "$repoRoot:/tmp/lint",
    "-v", "$outHost:/tmp/lint/megalinter-reports",
    "-w", "/tmp/lint",
    "-e", "MEGALINTER_CONFIG=/tmp/lint/.megalinter/presets/$presetName.yml",
    "-e", "REPORT_OUTPUT_FOLDER=megalinter-reports",
    "-e", "LOG_LEVEL=INFO"
)

if ($Mode -eq "ci") {
    $dockerArgs += @("-e", "CI=true")
}
else {
    $dockerArgs += @("-e", "CI=false")
}

if (-not [string]::IsNullOrWhiteSpace($filesCsv)) {
    # Variable standard MegaLinter pour forcer la liste de fichiers à analyser (CSV)
    # (MegaLinter: MEGALINTER_FILES_TO_LINT) :contentReference[oaicite:2]{index=2}
    $dockerArgs += @("-e", ("MEGALINTER_FILES_TO_LINT={0}" -f $filesCsv))
}

$dockerArgs += $image

Write-Log DBG ("docker {0}" -f ($dockerArgs -join " "))

& docker @dockerArgs
$exit = $LASTEXITCODE

# Vérifie la présence des rapports (observabilité)
$expected = @(
    (Join-Path $outHost "megalinter-report.sarif"),
    (Join-Path $outHost "mega-linter-report.json"),
    (Join-Path $outHost "megalinter-report.html")
)

$found = @()
foreach ($p in $expected) {
    if (Test-Path -LiteralPath $p) { $found += $p }
}

if ($found.Count -gt 0) {
    Write-Log INFO "Rapports détectés :"
    $found | ForEach-Object { Write-Output ("  - " + $_) }
}
else {
    Write-Log WARN "Aucun rapport attendu trouvé dans $outHost (vérifie REPORT_OUTPUT_FOLDER et les reporters)."
}

if ($exit -ne 0) {
    Write-Log WARN "Docker/MegaLinter exit=$exit (en Phase 0, un 0 est attendu sauf crash Docker)."
}

exit $exit
