<#
.SYNOPSIS
Lance l'outil d'audit interactif de Playwright sur Firefox.
Il enregistre toutes tes interactions (clics, frappes) et génère le code TypeScript correspondant.
Ferme le navigateur pour arrêter l'enregistrement.
#>

$TargetUrl = "http://localhost:5173"
$OutputFile = "tests/e2e/audit-live-flow.spec.ts"

Write-Host "[AUDIT E2E] Démarrage de Playwright Inspector sur Firefox..." -ForegroundColor Cyan
Write-Host "[AUDIT E2E] Naviguez, cliquez et remplissez le formulaire. Le code sera généré dans $OutputFile" -ForegroundColor Yellow

# Lance codegen avec le moteur Firefox, sauvegarde la sortie dans le fichier spécifié
npx playwright codegen --browser firefox $TargetUrl -o $OutputFile

Write-Host "[AUDIT E2E] Enregistrement terminé. Fichier généré : $OutputFile" -ForegroundColor Green