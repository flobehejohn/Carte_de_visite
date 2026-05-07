# Documentation — Oracle Zarathustra LLMed

Cette documentation accompagne la branche vitrine `oracle.z.demo` et la branche de présentation stricte `docs/oracle-z-demo-presentation-20260430`.

## Démo officielle

URL publique de démonstration : [`https://appllmedwtfix.vercel.app`](https://appllmedwtfix.vercel.app)

Cette URL est la cible Vercel de référence pour la branche vitrine.

## Lecture recommandée

1. [`SYSTEM_CONTRACT.md`](SYSTEM_CONTRACT.md) — contrat normatif du système.
2. [`ARCHITECTURE_MASTER.md`](ARCHITECTURE_MASTER.md) — vue d’ensemble architecture et responsabilités.
3. [`RUNBOOK.md`](RUNBOOK.md) — commandes d’exploitation, validation et diagnostic.
4. [`certification/oracle-z-demo-certification.md`](certification/oracle-z-demo-certification.md) — synthèse de certification runtime.
5. [`certification/evidence-index.md`](certification/evidence-index.md) — index des preuves.
6. [`certification/presentation-branch-final-report.md`](certification/presentation-branch-final-report.md) — état final de cette branche documentaire.

## Hiérarchie documentaire

| Niveau | Rôle |
|---|---|
| `README.md` | Entrée vitrine lisible en quelques minutes |
| `docs/SYSTEM_CONTRACT.md` | Source de vérité contractuelle |
| `docs/ARCHITECTURE_MASTER.md` | Vue système complète |
| `docs/RUNBOOK.md` | Procédures d’exécution et diagnostic |
| `docs/certification/` | Preuves, rapports, index |
| `artifacts/portfolio/` | Sélection curée de preuves présentables |

## Principe de branche

Cette branche est strictement documentaire : elle ne doit pas modifier `src/**`, `scripts/**` ni `.github/**` par rapport à `oracle.z.demo`.

## Principe central

Le repo n'est pas seulement une démo visuelle. C'est une démonstration de transformation progressive d'un prototype 3D/LLM en runtime gouverné, observable, testable et certifiable.
