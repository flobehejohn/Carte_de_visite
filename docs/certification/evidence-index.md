# Oracle Z Demo — Evidence Index

## Objectif

Ce document indexe les preuves disponibles pour comprendre et vérifier la certification de `oracle.z.demo` et la portée de la branche documentaire stricte.

## Branche certifiée

| Élément | Valeur |
|---|---|
| Branche runtime | `oracle.z.demo` |
| SHA | `f5a0555a495e7b30037382bf510f750d614fc597` |
| Repo | `flobehejohn/Carte_de_visite` |
| Branche documentaire | `docs/oracle-z-demo-presentation-20260430` |

## Preuves versionnées

| Type | Chemin |
|---|---|
| Contrat système | `docs/SYSTEM_CONTRACT.md` |
| Architecture maître | `docs/ARCHITECTURE_MASTER.md` |
| Runbook | `docs/RUNBOOK.md` |
| Certification runtime | `docs/certification/oracle-z-demo-certification.md` |
| Rapport final branche docs | `docs/certification/presentation-branch-final-report.md` |
| Portfolio de preuves | `artifacts/portfolio/README.md` |

## Preuves locales non versionnées

Les logs complets restent locaux pour éviter d’alourdir le repo :

- `.audit/`
- `audit/_latest/`
- `playwright-report/`
- `test-results/`

## Politique de versionnement

Cette branche doit versionner :

1. la synthèse de décision ;
2. la matrice des commandes ;
3. les documents d’architecture ;
4. les runbooks ;
5. l’index de preuves ;
6. la structure du portfolio.

Elle ne doit pas versionner :

- secrets ;
- `.env` ;
- dumps d’audit complets ;
- binaires lourds ;
- `dist/` ;
- `node_modules/`.
