<#
.SYNOPSIS
    Cartographie complète du Rituel Zarathoustra (Flow, Étapes, Prompts).
.DESCRIPTION
    Analyse les fichiers sources React et TypeScript pour reconstruire
    le déroulé logique de l'expérience utilisateur et les directives IA.
#>

$rootPath = Get-Location
$wizardPath = Join-Path $rootPath "src\components\oracle\RitualWizard.tsx"
$servicePath = Join-Path $rootPath "src\services\zarathustraService.ts"

Clear-Host
Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host "   🔮 CARTOGRAPHIE DU RITUEL : ORACLE ZARATHOUSTRA" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor DarkYellow
Write-Host ""

# 1. VÉRIFICATION DES FICHIERS
if (-not (Test-Path $wizardPath) -or -not (Test-Path $servicePath)) {
    Write-Host "❌ ERREUR : Impossible de trouver les fichiers sources." -ForegroundColor Red
    Write-Host "Assurez-vous d'être à la racine du projet 'app_llmed'."
    exit
}

$wizardContent = Get-Content $wizardPath -Raw
$serviceContent = Get-Content $servicePath -Raw

# -------------------------------------------------------------------------
# 2. EXTRACTION DE LA STRUCTURE (WIZARD)
# -------------------------------------------------------------------------
Write-Host "📍 I. STRUCTURE SÉQUENTIELLE (Le Chemin du Pèlerin)" -ForegroundColor Cyan
Write-Host "----------------------------------------------------"

# Extraction des étapes (STEPS)
# On utilise une regex pour capturer les objets dans const STEPS = [...]
if ($wizardContent -match "const STEPS = \[\s*([\s\S]*?)\];") {
    $stepsRaw = $matches[1]
    # Nettoyage basique pour l'affichage
    $steps = $stepsRaw -split "\}," | ForEach-Object { 
        $_ -replace "\{", "" -replace "\}", "" -replace "'", "" -replace '"', "" -replace "\s+", " " 
    }

    $i = 1
    foreach ($step in $steps) {
        if ($step.Trim().Length -gt 0) {
            # Parsing simple des clés id, label, q
            $id = [regex]::Match($step, "id:\s*(\w+)").Groups[1].Value
            $label = [regex]::Match($step, "label:\s*([^,]+)").Groups[1].Value
            $q = [regex]::Match($step, "q:\s*([^,]+)").Groups[1].Value
            
            Write-Host "  ÉTAPE $i : " -NoNewline -ForegroundColor Green
            Write-Host "$label ($id)" -ForegroundColor White
            Write-Host "     ❓ Question : $q" -ForegroundColor Gray
            
            # Si c'est l'étape mood ou format, on cherche les choix
            if ($id -eq "mood") {
                if ($wizardContent -match "const MOODS = \[(.*?)\];") {
                    $moods = $matches[1] -replace "'", "" -replace '"', ""
                    Write-Host "     ⚡ Choix : $moods" -ForegroundColor DarkGray
                }
            }
            if ($id -eq "format") {
                if ($wizardContent -match "const FORMATS = \[(.*?)\];") {
                    Write-Host "     ⚡ Choix : Conseil (Ordre), Miroir (Reflet), Oracle (Énigme)" -ForegroundColor DarkGray
                }
            }
            $i++
        }
    }
}

# -------------------------------------------------------------------------
# 3. ANALYSE DU GARDIEN (INTER-SÉQUENCE)
# -------------------------------------------------------------------------
Write-Host "`n👁️  II. LE GARDIEN DU SEUIL (Logique de Transition)" -ForegroundColor Cyan
Write-Host "----------------------------------------------------"

if ($serviceContent -match "const GUARDIAN_PROMPT = `([\s\S]*?)`;") {
    $guardianPrompt = $matches[1]
    
    Write-Host "  LOGIQUE :" -ForegroundColor Yellow
    Write-Host "  À chaque validation d'étape (hors Format), le Gardien intercepte la réponse."
    
    Write-Host "`n  📜 DIRECTIVES DU GARDIEN (Extrait du Prompt) :" -ForegroundColor Magenta
    
    # Extraction des règles clés du prompt
    $lines = $guardianPrompt -split "`n"
    foreach ($line in $lines) {
        if ($line -match "RÈGLE|MISSION|SORTIE|Si") {
            Write-Host "    $($line.Trim())" -ForegroundColor Gray
        }
    }
    
    Write-Host "`n  ⚙️ MÉCANISME UX :" -ForegroundColor Yellow
    Write-Host "    1. Input Utilisateur -> Validation"
    Write-Host "    2. API Call (Gemini Flash)"
    Write-Host "    3. UI : Effet Machine à écrire (Typewriter)"
    Write-Host "    4. Bouton 'Poursuivre' apparaît UNIQUEMENT à la fin du texte."
}

# -------------------------------------------------------------------------
# 4. LA RÉVÉLATION FINALE (ORACLE)
# -------------------------------------------------------------------------
Write-Host "`n🔥 III. L'INVOCATION FINALE (Le Cœur du Système)" -ForegroundColor Cyan
Write-Host "----------------------------------------------------"

if ($serviceContent -match "const ORACLE_SYSTEM_PROMPT = `([\s\S]*?)`;") {
    $oraclePrompt = $matches[1]
    
    Write-Host "  🎯 OBJECTIF :" -ForegroundColor Yellow
    Write-Host "  Générer une réponse unique basée sur : Nom + Humeur + Format + Question."
    
    Write-Host "`n  📜 DIRECTIVES DE ZARATHOUSTRA :" -ForegroundColor Magenta
    
    $lines = $oraclePrompt -split "`n"
    foreach ($line in $lines) {
        if ($line -match "CRITIQUE|SORTIE|INTERDIT|TÂCHE") {
            Write-Host "    $($line.Trim())" -ForegroundColor Gray
        }
    }
    
    Write-Host "`n  💎 RENDU VISUEL :" -ForegroundColor Yellow
    Write-Host "    - Citation (Grand, Serif, Italique)"
    Write-Host "    - Métadonnées (Chapitre source, Thème philosophique)"
    Write-Host "    - Exégèse (Interprétation personnalisée)"
    Write-Host "    - Bouton Reset (Fermer le cercle)"
}

# -------------------------------------------------------------------------
# 5. DIAGNOSTIC TECHNIQUE RAPIDE
# -------------------------------------------------------------------------
Write-Host "`n🛠️  IV. DIAGNOSTIC TECHNIQUE" -ForegroundColor Cyan
Write-Host "----------------------------------------------------"

# Vérification Typewriter
if ($wizardContent -match "Typewriter key=\{lastGuidance\}") {
    Write-Host "  ✅ UX : Key unique sur Typewriter détectée (Empêche la double écriture)." -ForegroundColor Green
} else {
    Write-Host "  ⚠️ UX : Key unique sur Typewriter NON DÉTECTÉE (Risque de bug)." -ForegroundColor Red
}

# Vérification Reset
if ($wizardContent -match "handleReset") {
    Write-Host "  ✅ LOGIQUE : Fonction de Reset détectée." -ForegroundColor Green
}

# Vérification Responsive
if ($wizardContent -match "overflow-y-auto") {
    Write-Host "  ✅ LAYOUT : Scroll autorisé (overflow-y-auto) détecté dans RitualWizard/Layout." -ForegroundColor Green
} elseif (Get-Content (Join-Path $rootPath "src\components\layout\OracleLayout.tsx") -Raw -match "overflow-y-auto") {
    Write-Host "  ✅ LAYOUT : Scroll autorisé détecté dans OracleLayout." -ForegroundColor Green
} else {
    Write-Host "  ⚠️ LAYOUT : Attention, 'overflow-hidden' strict détecté (Risque sur mobile)." -ForegroundColor Yellow
}

Write-Host "`n==========================================================" -ForegroundColor DarkYellow
Write-Host "   FIN DE LA CARTOGRAPHIE"
Write-Host "==========================================================" -ForegroundColor DarkYellow