# Fix-Phase3Lock_v2.ps1
# VERSION ROBUSTE : Auto-init Git et chemins absolus
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- CONFIGURATION ---
$global:LOG_PREFIX = "[PH3-LOCK]"
$global:SUMMARY = @{ Timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"); Steps = @(); Status = "PENDING" }

# --- OUTILS ---
function Log-Info ($Msg) { Write-Host "$global:LOG_PREFIX [INFO] $Msg" -ForegroundColor Cyan }
function Log-Ok ($Msg) { Write-Host "$global:LOG_PREFIX [OK] $Msg" -ForegroundColor Green }
function Log-Warn ($Msg) { Write-Host "$global:LOG_PREFIX [WARN] $Msg" -ForegroundColor Yellow }
function Log-Err ($Msg) { Write-Host "$global:LOG_PREFIX [ERR] $Msg" -ForegroundColor Red }

function Run-Step {
    param([string]$Name, [scriptblock]$Action, [bool]$CanRetry = $false)
    $start = Get-Date
    Log-Info "Début étape: $Name"
    try {
        & $Action
        $duration = ((Get-Date) - $start).TotalSeconds
        Log-Ok "$Name terminé en $($duration.ToString('N2'))s"
        $global:SUMMARY.Steps += @{ Name = $Name; Status = "OK"; Duration = $duration }
    }
    catch {
        Log-Err "Echec étape $Name : $_"
        if ($CanRetry) {
            Log-Warn "Tentative de correction automatique..."
            try {
                & $Action
                Log-Ok "$Name (Retry) SUCCÈS"
                $global:SUMMARY.Steps += @{ Name = $Name; Status = "OK_RETRY" }
            }
            catch {
                Log-Err "Echec définitif $Name : $_"; $global:SUMMARY.Status = "FAILED"; Export-Summary; exit 1
            }
        }
        else {
            $global:SUMMARY.Steps += @{ Name = $Name; Status = "KO"; Error = "$_" }; $global:SUMMARY.Status = "FAILED"; Export-Summary; exit 1
        }
    }
}

function Export-Summary {
    $reportDir = "audit/_latest"
    if (!(Test-Path $reportDir)) { New-Item -ItemType Directory -Path $reportDir -Force | Out-Null }
    $global:SUMMARY | ConvertTo-Json -Depth 5 | Set-Content "$reportDir/phase3_smoke_summary.json"
}

# --- AUDITS ET PATCHES ---

Run-Step "Init-Git-Context" {
    # 1. Forcer le chemin absolu connu
    $targetPath = "C:\ATLAS\INBOX\dev\R_D\carte_de_visite\test_unitaire\app_llmed"
    if (Test-Path $targetPath) { 
        Set-Location $targetPath 
    }
    else {
        Log-Warn "Chemin absolu introuvable, utilisation du dossier courant."
    }

    # 2. Auto-Init Git si absent
    if (!(Test-Path ".git")) {
        Log-Warn "Repo Git non détecté (.git absent). Initialisation automatique..."
        git init
        git config user.email "bot@atlas.local"
        git config user.name "Atlas Bot"
        git add .
        git commit -m "Auto-init Phase 3 Fixer"
    }

    $root = git rev-parse --show-toplevel
    Log-Info "Racine active: $root"
}

Run-Step "Inventaire-Fichiers" {
    $required = @("src/scene/RitualOrchestrator.js", "scripts/_auditRun.ps1", "scripts/validate-full.ps1")
    foreach ($f in $required) { if (!(Test-Path $f)) { throw "Fichier manquant: $f" } }
}

Run-Step "Patch-Scripts-Stability" {
    # Fix Env Vars $env:$var
    Get-ChildItem "scripts/*.ps1" | ForEach-Object {
        $c = Get-Content $_.FullName -Raw
        if ($c -match '\$env:\$(\w+)') {
            Log-Warn "Patching env vars dans $($_.Name)"
            Set-Content $_.FullName ([Regex]::Replace($c, '\$env:\$(\w+)', { param($m) "[Environment]::GetEnvironmentVariable(`$$($m.Groups[1].Value))" }))
        }
    }
    # Fix cleanup type
    $cl = "scripts/cleanup-audit.ps1"
    if ((Get-Content $cl -Raw) -match '\[DateTime\]\$Cutoff') {
        Log-Warn "Patching cleanup-audit.ps1 Cutoff"
        (Get-Content $cl -Raw).Replace('[DateTime]$Cutoff', '[Nullable[DateTime]]$Cutoff = $null') | Set-Content $cl
    }
    # Fix Trap/Exit
    @("scripts/gate.ps1", "scripts/validate-full.ps1") | ForEach-Object {
        $txt = Get-Content $_ -Raw
        if ($txt -notmatch 'trap') {
            Log-Warn "Ajout trap erreur dans $_"
            ('$ErrorActionPreference="Stop"; trap{exit 1}' + "`n" + $txt) | Set-Content $_
        }
    }
} -CanRetry $true

Run-Step "Audit-Source-Exports" {
    $js = "src/scene/RitualOrchestrator.js"
    $code = Get-Content $js -Raw
    if ($code -match 'export default class') {
        Log-Warn "Fixing export default -> export class"
        $code -replace 'export default class', 'export class' | Set-Content $js
    }

    $test = "src/scene/RitualOrchestrator.orderLock.test.js"
    $tCode = Get-Content $test -Raw
    if ($tCode -match 'import RitualOrchestrator from') {
        Log-Warn "Fixing import default -> named"
        $tCode -replace 'import RitualOrchestrator from', 'import { RitualOrchestrator } from' | Set-Content $test
    }
} -CanRetry $true

Run-Step "Exec-Tests-And-Runners" {
    # Run Vitest
    Log-Info "Running Vitest..."
    $v = Start-Process npx -ArgumentList "vitest run src/scene/RitualOrchestrator.orderLock.test.js" -NoNewWindow -PassThru -Wait
    if ($v.ExitCode -ne 0) { throw "Vitest Failed" }

    # Run Local Validate
    Log-Info "Running validate-full.ps1..."
    $p = Start-Process pwsh -ArgumentList "-File scripts/validate-full.ps1" -NoNewWindow -PassThru -Wait
    if ($p.ExitCode -ne 0) { throw "validate-full Failed" }
}

$global:SUMMARY.Status = "SUCCESS"
Export-Summary
Log-Ok "FIN: Tout est vert."
exit 0