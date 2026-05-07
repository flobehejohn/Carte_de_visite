# Runbook — Oracle Zarathustra LLMed

## Rôle

Ce runbook décrit les commandes et diagnostics nécessaires pour exploiter localement la branche vitrine, certifier une modification documentaire ou technique, et lire les preuves produites.

Pour le contrat normatif, voir [`SYSTEM_CONTRACT.md`](SYSTEM_CONTRACT.md). Pour la vue système, voir [`ARCHITECTURE_MASTER.md`](ARCHITECTURE_MASTER.md).

## Prérequis

- Windows PowerShell ou PowerShell 7.
- Node compatible avec le repo.
- Dépendances installées via `npm ci`.
- Navigateurs Playwright installés si les E2E sont exécutés.
- Variables d’environnement serveur configurées si les tests appellent réellement `/api/gemini`.

## Installation locale

```powershell
Set-Location "C:\ATLAS\INBOX\dev\R_D\carte_de_visite\test_unitaire\app_llmed_wt_fix"
npm ci
```

## Golden path documentaire

À utiliser pour une modification strictement documentaire :

```powershell
git status --short --branch
git diff --check
npm.cmd run typecheck
npm.cmd run build
```

Ce chemin vérifie que la documentation n’a pas cassé le repo, sans relancer toute la certification runtime.

## Golden path complet

À utiliser dès qu’un fichier `src/`, `scripts/`, `.github/`, `package.json`, `vite`, `tsconfig` ou Playwright est touché :

```powershell
git diff --check
npm.cmd run typecheck
npm.cmd run test:optics
npm.cmd run test
npm.cmd run build
npm.cmd run gate:bundle
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\gate-render.ps1
npm.cmd run test:e2e:first-paint
npm.cmd run test:e2e:visual-policy
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\audit-runtime.ps1
```

## Commandes par objectif

| Objectif | Commande |
|---|---|
| Vérifier espaces/format Git | `git diff --check` |
| Vérifier typage client + serveur | `npm.cmd run typecheck` |
| Tester les politiques optiques | `npm.cmd run test:optics` |
| Lancer la suite Vitest | `npm.cmd run test` |
| Construire le bundle | `npm.cmd run build` |
| Vérifier les budgets bundle | `npm.cmd run gate:bundle` |
| Vérifier les invariants de rendu | `pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\gate-render.ps1` |
| Vérifier le premier rendu utile | `npm.cmd run test:e2e:first-paint` |
| Vérifier les politiques visuelles E2E | `npm.cmd run test:e2e:visual-policy` |
| Auditer le runtime navigateur | `pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\audit-runtime.ps1` |

## Lecture des preuves

Documents versionnés :

- [`docs/certification/oracle-z-demo-certification.md`](certification/oracle-z-demo-certification.md)
- [`docs/certification/evidence-index.md`](certification/evidence-index.md)
- [`docs/certification/presentation-branch-final-report.md`](certification/presentation-branch-final-report.md)

Artefacts locaux non versionnés :

- `.audit/`
- `audit/_latest/`
- `playwright-report/`
- `test-results/`

Le repo versionne les synthèses et index de preuves, pas les dumps complets.

## Diagnostic port 5173

Symptôme : E2E bloqué, Vite ne démarre pas, ou erreur de port déjà occupé.

```powershell
Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

Arrêter le processus si nécessaire :

```powershell
$pidToStop = (Get-NetTCPConnection -LocalPort 5173 -State Listen).OwningProcess | Select-Object -First 1
Stop-Process -Id $pidToStop -Force
```

## Diagnostic Vercel local

```powershell
npx vercel whoami
npx vercel link
npx vercel env ls
```

Récupérer les variables :

```powershell
npx vercel env pull .env.local
npx vercel pull --environment=preview
npx vercel pull --environment=production
```

Déployer un preview manuel :

```powershell
npx vercel deploy --logs
```

Déployer en production :

```powershell
npx vercel deploy --prod --logs
```

## Matrice incident rapide

| Symptôme | Cause probable | Vérification | Action |
|---|---|---|---|
| Mermaid GitHub cassé | label Mermaid ambigu ou non quoté | ouvrir README sur GitHub | citer les labels Mermaid |
| `5173` indisponible | ancien process Vite/Node actif | `Get-NetTCPConnection -LocalPort 5173` | arrêter le PID |
| `typecheck` KO | divergence type client/server | `npm.cmd run typecheck` | corriger sans cast large |
| `gate:bundle` KO | chunk ou budget dépassé | `npm.cmd run gate:bundle` | analyser build et split |
| `audit-runtime` KO | bridge navigateur absent ou contrat runtime cassé | `audit-runtime.ps1` | vérifier `window.__ORB_AUDIT__` |
| `test:e2e:first-paint` KO | premier rendu utile absent | Playwright trace/log | vérifier lazy 3D et fallback UI |
| réponse LLM 422 | invariant strict cassé | lire `violations` et `traceId` | corriger état final, citations ou corpus |
| Vercel env manquante | variable absente en preview/prod | `npx vercel env ls` | ajouter variable dans Vercel |

## Politique de branche

- `oracle.z.demo` reste la base runtime certifiée.
- `docs/oracle-z-demo-presentation-20260430` reste une branche strictement documentaire.
- Tout changement runtime doit partir dans une autre branche.

## Critère de clôture

La branche est prête lorsque :

1. README GitHub rend tous les diagrammes Mermaid.
2. Les documents canoniques existent et sont liés.
3. Les preuves sont indexées.
4. Aucun fichier `src/**`, `scripts/**` ou `.github/**` n’est modifié par rapport à `oracle.z.demo`.
5. `git diff --check` et les validations adaptées passent.
