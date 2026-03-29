param(
  [string]$Repo = 'C:\ATLAS\INBOX\dev\R_D\carte_de_visite\test_unitaire\app_llmed_wt_fix'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Set-ExecutionPolicy -Scope Process Bypass -Force

Set-Location $Repo

Write-Host '==> Repo' -ForegroundColor Cyan
Write-Host (Get-Location).Path

$Targets = @(
  'src/components/oracle/Oracle3DScene.tsx',
  'src/components/oracle/Oracle3DScene.cycle.test.tsx',
  'src/components/oracle/Oracle3DScene.audit.integration.test.tsx',
  'src/components/oracle/Oracle3DScene.audit.ast.test.ts'
)

Write-Host '==> Presence des fichiers' -ForegroundColor Cyan
foreach ($File in $Targets) {
  if (-not (Test-Path $File)) {
    throw "Fichier manquant : $File"
  }
  Write-Host "OK  $File" -ForegroundColor Green
}

Write-Host '==> Verification diff brut' -ForegroundColor Cyan
git diff --check

Write-Host '==> Typecheck' -ForegroundColor Cyan
npm run typecheck

Write-Host '==> Lot cible phase Oracle3D' -ForegroundColor Cyan
npx vitest run `
  src/components/oracle/Oracle3DScene.cycle.test.tsx `
  src/components/oracle/Oracle3DScene.audit.integration.test.tsx `
  src/components/oracle/Oracle3DScene.audit.ast.test.ts `
  --reporter=verbose

Write-Host '==> Build' -ForegroundColor Cyan
npm run build

Write-Host '==> Recherche residuelle d assertions textuelles fragiles sur ce lot' -ForegroundColor Cyan
if (Get-Command rg -ErrorAction SilentlyContinue) {
  rg -n "toContain\(|toMatch\(|toHaveTextContent\(|includes\(" src/components/oracle/Oracle3DScene*.test.*
}
else {
  Write-Host 'rg non disponible, etape informative ignoree.' -ForegroundColor Yellow
}

Write-Host '==> Statut git' -ForegroundColor Cyan
git status --short --branch

Write-Host 'VALIDATION ORACLE3DSCENE : OK' -ForegroundColor Green
