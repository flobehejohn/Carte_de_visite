# scripts/ci-megalint.ps1
# Lancement MegaLinter (Docker) avec presets modulaires + ledger d'artefacts

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

    # Si true: un fichier manquant dans -Files => warning + continue
    # Sinon (par défaut): throw (fail fast)
    [Parameter()]
    [switch]$AllowMissingFiles,

    # Liste explicite de fichiers (relatifs au repo) à linter.
    [Parameter()]
    [string[]]$Files
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Now-Stamp { (Get-Date).ToString("yyyyMMdd_HHmmss") }

function Write-Log {
    param(
        [Parameter(Mandatory)][ValidateSet("INFO", "WARN", "ERR", "DBG")][string]$Level,
        [Parameter(Mandatory)][string]$Message
    )
    $prefix = "[ci-megalint][$Level]"
    switch ($Level) {
        "ERR" { Write-Error    "$prefix $Message" }
        "WARN" { Write-Warning  "$prefix $Message" }
        default { Write-Output  "$prefix $Message" }
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
    $p2 = if ($null -eq $p) { "" } else { $p }
    $p2 = $p2.Trim()
    if ($p2.EndsWith(".yml")) { return $p2.Substring(0, $p2.Length - 4) }
    if ($p2.EndsWith(".yaml")) { return $p2.Substring(0, $p2.Length - 5) }
    return $p2
}

function Resolve-RepoRoot {
    $root = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
    return $root.Path
}

function Sanitize-PathPart([string]$s) {
    if ([string]::IsNullOrWhiteSpace($s)) { return "" }
    return (($s.Trim()) -replace '[\\/:*?"<>|]', '_')
}

function Assert-Command([string]$name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "Commande introuvable: $name (installe-la / vérifie PATH)"
    }
}

function To-DockerHostPath([string]$windowsPath) {
    return ($windowsPath -replace '\\', '/')
}

function Normalize-FilesToLint {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter()][string[]]$RawFiles,
        [Parameter()][switch]$AllowMissing
    )

    $acc = New-Object System.Collections.Generic.List[string]

    foreach ($f in @($RawFiles)) {
        if ([string]::IsNullOrWhiteSpace($f)) { continue }

        # Le param peut arriver sous plusieurs formes:
        # - vrai tableau: "a","b"
        # - 1 string: '"a","b"' ou 'a,b'
        $raw = $f.Trim()

        # Split puis nettoyage PAR ELEMENT (clé pour virer les guillemets traînants)
        $parts = $raw.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ }

        foreach ($part in $parts) {
            $clean = $part.Trim().Trim('"').Trim("'").Trim()
            if ([string]::IsNullOrWhiteSpace($clean)) { continue }

            $rel = $clean.Replace('\', '/')
            if ($rel.StartsWith("./")) { $rel = $rel.Substring(2) }

            # Interdit les chemins absolus
            if ([System.IO.Path]::IsPathRooted($rel)) {
                if ($AllowMissing) {
                    Write-Log WARN "Chemin absolu ignoré (AllowMissingFiles): $rel"
                    continue
                }
                throw "Chemin absolu interdit dans -Files (attendu: relatif repo): $rel"
            }

            $abs = Join-Path $RepoRoot ($rel -replace '/', '\')
            if (-not (Test-Path -LiteralPath $abs)) {
                if ($AllowMissing) {
                    Write-Log WARN "Fichier introuvable ignoré (AllowMissingFiles): $rel"
                    continue
                }
                throw "Fichier introuvable (relatif repo attendu) : $rel"
            }

            $acc.Add($rel)
        }
    }

    return @($acc.ToArray() | Sort-Object -Unique)
}

try {
    Assert-Command "docker"

    $repoRoot = Resolve-RepoRoot

    $presetName = Normalize-PresetName $Preset
    $presetHostPath = Join-Path $repoRoot (".megalinter\presets\{0}.yml" -f $presetName)
    if (-not (Test-Path -LiteralPath $presetHostPath)) {
        throw "Preset introuvable: $presetHostPath"
    }

    # RunStamp stable (safe pour dossier)
    if ([string]::IsNullOrWhiteSpace($RunStamp)) {
        $RunStamp = ("MEGALINT_{0}" -f (Now-Stamp))
    }
    $runStampSafe = Sanitize-PathPart $RunStamp
    if ([string]::IsNullOrWhiteSpace($runStampSafe)) {
        $runStampSafe = ("MEGALINT_{0}" -f (Now-Stamp))
    }

    # Ledger root
    $outHost = Ensure-Dir (Join-Path $repoRoot (Join-Path "audit\megalinter" $runStampSafe))
    $outHostPreset = Ensure-Dir (Join-Path $outHost (Sanitize-PathPart $presetName))

    $repoRootDocker = To-DockerHostPath $repoRoot
    $outHostPresetDocker = To-DockerHostPath $outHostPreset

    # Files => FORCER tableau au point d'appel (évite les surprises sur .Count)
    $filesToLint = @(Normalize-FilesToLint -RepoRoot $repoRoot -RawFiles $Files -AllowMissing:$AllowMissingFiles)
    $filesCount = @($filesToLint).Count

    $filesCsv = $null
    if ($filesCount -gt 0) {
        $filesCsv = ($filesToLint -join ",")
        Write-Log INFO ("Run ciblé: {0} fichier(s)" -f $filesCount)
        Write-Log DBG  ("FilesToLint: {0}" -f ($filesToLint -join " | "))
        Write-Log DBG  ("MEGALINTER_FILES_TO_LINT={0}" -f $filesCsv)
    }
    else {
        Write-Log DBG "Aucun -Files fourni => run sur le périmètre du preset"
    }

    $image = $env:MEGALINTER_IMAGE
    if ([string]::IsNullOrWhiteSpace($image)) { $image = "oxsecurity/megalinter:v9" }

    Write-Log INFO "RepoRoot  : $repoRoot"
    Write-Log INFO "Preset    : $presetName"
    Write-Log INFO "PresetPath: $presetHostPath"
    Write-Log INFO "RunStamp  : $RunStamp"
    Write-Log INFO "Reports   : $outHostPreset"
    Write-Log INFO "Image     : $image"

    $dockerArgs = @(
        "run", "--rm",
        "-v", "${repoRootDocker}:/tmp/lint",
        "-v", "${outHostPresetDocker}:/tmp/lint/megalinter-reports",
        "-w", "/tmp/lint",
        "-e", "MEGALINTER_CONFIG=/tmp/lint/.megalinter/presets/$presetName.yml",
        "-e", "REPORT_OUTPUT_FOLDER=megalinter-reports",
        "-e", "LOG_LEVEL=INFO"
    )

    if ($Mode -eq "ci") { $dockerArgs += @("-e", "CI=true") }
    else { $dockerArgs += @("-e", "CI=false") }

    if (-not [string]::IsNullOrWhiteSpace($filesCsv)) {
        $dockerArgs += @("-e", "MEGALINTER_FILES_TO_LINT=$filesCsv")
    }

    $dockerArgs += $image

    Write-Log DBG ("docker {0}" -f ($dockerArgs -join " "))

    & docker @dockerArgs
    $exit = $LASTEXITCODE

    # Observabilité: rapports
    $reports = @()
    if (Test-Path -LiteralPath $outHostPreset) {
        $reports = @(
            Get-ChildItem -LiteralPath $outHostPreset -Recurse -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '\.(sarif|html|json)$' } |
            Sort-Object FullName
        )
    }

    $reportsCount = @($reports).Count
    if ($reportsCount -gt 0) {
        Write-Log INFO "Rapports détectés :"
        @($reports) | ForEach-Object { Write-Output ("  - " + $_.FullName) }
    }
    else {
        Write-Log WARN "Aucun rapport .sarif/.html/.json trouvé dans $outHostPreset (vérifie reporters + REPORT_OUTPUT_FOLDER)."
    }

    if ($exit -ne 0) {
        Write-Log WARN "Docker/MegaLinter exit=$exit (Phase 0 attend plutôt 0 sauf crash/config)."
    }

    exit $exit
}
catch {
    Write-Log ERR $_.Exception.Message
    exit 1
}
