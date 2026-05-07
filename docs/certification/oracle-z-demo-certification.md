# Oracle Z Demo — Certification Summary

## Décision

**CERTIFIÉ COMME BASE RUNTIME**

La branche `oracle.z.demo` est la base runtime certifiée utilisée pour cette branche documentaire stricte.

## Contexte

| Champ | Valeur |
|---|---|
| Repo | `flobehejohn/Carte_de_visite` |
| Branche runtime | `oracle.z.demo` |
| Branche source historique | `fix/live-scene-visibility_20260330` |
| SHA certifié | `f5a0555a495e7b30037382bf510f750d614fc597` |
| Branche documentaire | `docs/oracle-z-demo-presentation-20260430` |

## Matrice de validation certifiée

Les validations locales rapportées pour la branche runtime certifiée incluent :

| Étape | Commande |
|---|---|
| Diff check | `git diff --check` |
| Typecheck | `npm.cmd run typecheck` |
| Tests optiques | `npm.cmd run test:optics` |
| Tests Vitest | `npm.cmd run test` |
| Build | `npm.cmd run build` |
| Bundle gate | `npm.cmd run gate:bundle` |
| Render gate | `pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\gate-render.ps1` |
| First paint E2E | `npm.cmd run test:e2e:first-paint` |
| Visual policy E2E | `npm.cmd run test:e2e:visual-policy` |
| Runtime audit | `pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\audit-runtime.ps1` |

## Résultats attendus

- TypeScript client et serveur valides.
- Tests optiques gouvernés valides.
- Build Vite valide.
- Budget bundle validé.
- Rendu Three.js auditable.
- E2E ciblés passés.
- Audit runtime disponible via `window.__ORB_AUDIT__`.

## Risques résiduels

| Risque | Niveau | Commentaire |
|---|---:|---|
| Logs `.audit/` non versionnés | Faible | Les synthèses sont versionnées ; les dumps complets restent locaux. |
| Chunk Three.js | Faible à moyen | Warning possible côté Vite ; budget projet contrôlé par `gate:bundle`. |
| E2E larges | Moyen | Les E2E ciblés sont la base certifiée ; les flows complets peuvent former une passe séparée. |

## Décision de branche documentaire

Cette branche documentaire stricte est construite au-dessus du SHA runtime certifié et ne doit pas modifier le comportement applicatif.
