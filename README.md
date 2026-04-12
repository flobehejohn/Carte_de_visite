# Oracle Zarathustra LLMed (`app_llmed_wt_fix`)

[![CI Status](https://img.shields.io/badge/CI-Passing-success?logo=githubactions&logoColor=white)](#)
[![Vercel Deploy](https://img.shields.io/badge/Vercel-Deployed-000000?logo=vercel&logoColor=white)](https://appllmedwtfix.vercel.app)

## 1. L'Intention (TL;DR)

Ce projet adresse un problème classique des intégrations LLM en production : des réponses non prouvables, non reproductibles, et difficiles à auditer.

**Métier :** L'application cible génère un rendu 3D accompagné de citations sourcées à partir du corpus de Zarathoustra.
**Technique :** Elle démontre une chaîne de traitement LLM strictement gouvernée par contrat, garantissant :

- des sorties structurées (JSON) sur les modes critiques,
- un comportement _fail-closed_ en cas de violation d'invariants,
- la traçabilité de chaque exécution via des artefacts d'audit exploitables en CI et en local.

## 2. Cartographie Architecturale

```mermaid
graph LR
  A[Requête client] --> B[/api/gemini]
  B --> C{mode}

  C -->|raw| D[Prompt libre]
  C -->|oracle / guardian| E[Retriever Zarathoustra\n+ citation_ids]

  D --> F[Appel Gemini]
  E --> G[Prompt builder contraint]
  G --> F

  F --> H[Parse JSON strict\n+ validation Zod]
  H --> I{Invariants fail-closed}

  I -->|OK| J[Enveloppe JSON ok=true\n+ citationsUsed]
  I -->|Violation| K[HTTP 422\nSTRICT_INVARIANT_VIOLATION]

  J --> L[Rendu applicatif]
  J --> M[validate-full / gate]
  K --> M
  M --> N[audit/_latest\nsummary.json\naudit-manifest.json\ngate.log]

3. Quickstart (Golden Path)

Commandes recommandées depuis la racine du repo :
PowerShell

npm ci
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-full.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\gate.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\ph3-lock.ps1

Références runbook : docs/annexes/RUNBOOK_CI.md et docs/annexes/ci-audit.md.
4. Contrat & Garanties du Système

    API en 3 modes explicites : raw, oracle, guardian (enveloppe de réponse schémée).

    Fail-closed strict actif par défaut sur oracle/guardian ; les violations retournent HTTP 422 avec STRICT_INVARIANT_VIOLATION.

    Sorties structurées imposées en mode strict pour oracle/guardian ; mode dégradé contrôlé en cas d'erreur amont.

    Contrats d'entrée/sortie validés par Zod (OracleRequestSchema, OracleResponseSchema, schémas structurés Oracle/Guardian).

    Politique de citations enforcée : minCitations borné (0..12), seuil effectif >=2 en oracle/guardian, citationsUsed contrôlé.

    Retriever de connaissances déterministe sur le corpus Zarathoustra, avec IDs de citation stables (tests de contrat).

    Parsing JSON robuste (fences/extraction stricte + réparation optionnelle via flags d'environnement), puis normalisation stricte.

    Audit CI/local traçable : summary.txt/json, audit-manifest.json, logs de gate, pointeur audit/latest.txt.

5. Navigation Documentaire Canonique

    docs/SYSTEM_CONTRACT.md - Règles du système et invariants runtime (source normative cible).

    docs/ARCHITECTURE_MASTER.md - Design macro et flux techniques (source architecturale cible).

    docs/RUNBOOK.md - Procédures d'exploitation (source opérationnelle cible).

    docs/ADR/ - Historique des décisions d'architecture.

État documentaire actuel exploitable dans ce workspace :

    docs/annexes/ci-audit.md

    docs/annexes/RUNBOOK_CI.md

    docs/annexes/phase2-knowledge.md

6. Preuves & Portfolio

Le dossier artifacts/portfolio/ centralise les preuves d'exécution par domaine (01-ui à 06-vercel) pour revue technique, audit de conformité et capitalisation CI.
```
