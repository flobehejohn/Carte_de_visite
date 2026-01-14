# Lock-Phase3_Final.ps1
# MASTER SCRIPT: Init Git, Fix Imports, Fix PowerShell, Lock Phase 3
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$LOG_PREFIX = "[PH3-FINAL]"
function Log ($msg, $color="Cyan") { Write-Host "$LOG_PREFIX $msg" -ForegroundColor $color }

# 1. INITIALISATION GIT (CRITIQUE)
Log "1. Vérification environnement Git..."
if (-not (Test-Path ".git")) {
    Log "git init requis..." -color Yellow
    git init | Out-Null
    git config user.email "devops@atlas.local"
    git config user.name "Atlas DevOps"
    # On fait un premier commit pour stabiliser
    if (Test-Path "package.json") {
        git add .
        git commit -m "chore: init phase 3 locking" | Out-Null
    }
    Log "Repo Git initialisé." -color Green
} else {
    Log "Repo Git déjà présent." -color Green
}

# 2. STANDARDISATION CODE (STRICT EXPORT/IMPORT)
Log "2. Standardisation JS/Test..."
$jsPath = "src/scene/RitualOrchestrator.js"
$testPath = "src/scene/RitualOrchestrator.orderLock.test.js"

# Force Export Named
$jsCode = Get-Content $jsPath -Raw
if ($jsCode -match 'export default class') {
    Log "Correction Export Default -> Named" -color Yellow
    $jsCode = $jsCode -replace 'export default class', 'export class'
    Set-Content $jsPath $jsCode
}

# Force Import Named dans le test
$testCode = Get-Content $testPath -Raw
if ($testCode -notmatch 'import \{ RitualOrchestrator \}') {
    Log "Correction Import Test -> Named Strict" -color Yellow
    # Regex flexible pour attraper "import RitualOrchestrator from..."
    $testCode = $testCode -replace 'import RitualOrchestrator from', 'import { RitualOrchestrator } from'
    Set-Content $testPath $testCode
}

# 3. REPARATION POWERSHELL (SANS CRASH PARSER)
Log "3. Patching Scripts PowerShell..."
$scripts = Get-ChildItem "scripts/*.ps1"
foreach ($s in $scripts) {
    $content = Get-Content $s.FullName -Raw
    $modified = $false
    
    # Patch 1: $env:$var (Utilisation de simple quotes pour la regex pour éviter le crash)
    if ($content -match '\$env:\$(\w+)') {
        Log "Patching variable dynamique dans $($s.Name)" -color Yellow
        $content = [Regex]::Replace($content, '\$env:\$(\w+)', { param($m) "[Environment]::GetEnvironmentVariable(`$$($m.Groups[1].Value))" })
        $modified = $true
    }
    
    # Patch 2: Cleanup DateTime Nullable
    if ($s.Name -eq "cleanup-audit.ps1" -and $content -match '\[DateTime\]\$Cutoff') {
        Log "Patching type DateTime dans cleanup-audit.ps1" -color Yellow
        $content = $content.Replace('[DateTime]$Cutoff', '[Nullable[DateTime]]$Cutoff = $null')
        $modified = $true
    }
    
    # Patch 3: Sécurisation Exit Code (si absent)
    if ($s.Name -match "(gate|validate)" -and $content -notmatch "trap") {
         Log "Ajout Trap/Exit dans $($s.Name)" -color Yellow
         $header = '$ErrorActionPreference = "Stop"; trap { exit 1 }' + "`n"
         $content = $header + $content
         $modified = $true
    }

    if ($modified) { Set-Content $s.FullName $content }
}

# 4. VALIDATION FINALE
Log "4. Exécution Test & Validation..."

Log " > Vitest..."
$v = Start-Process npx -ArgumentList "vitest run src/scene/RitualOrchestrator.orderLock.test.js" -NoNewWindow -PassThru -Wait
if ($v.ExitCode -ne 0) { throw "Vitest a échoué après standardisation." }

Log " > Script Validate-Full..."
# On lance le validate patché
$p = Start-Process pwsh -ArgumentList "-File scripts/validate-full.ps1" -NoNewWindow -PassThru -Wait
if ($p.ExitCode -ne 0) { 
    Log "validate-full a échoué. Vérifiez les logs." -color Red
    exit 1 
}

# 5. GENERATION RAPPORT
$summary = @{
    Status = "LOCKED"
    Phase = 3
    Timestamp = (Get-Date).ToString("u")
    GitRoot = (git rev-parse --show-toplevel)
}
$jsonPath = "audit/_latest/phase3_lock_summary.json"
New-Item -ItemType Directory -Path "audit/_latest" -Force | Out-Null
$summary | ConvertTo-Json | Set-Content $jsonPath

Log "PHASE 3 VERROUILLÉE AVEC SUCCÈS." -color Green
Log "Rapport: $jsonPath"
exit 0
