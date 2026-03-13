# Phase2 Knowledge - Runbook

Goals:
- Deterministic Zarathoustra retriever with stable citation ids.
- Zod request/response validation and safe fallbacks.
- Knowledge integrity gate and smoke checks with audit artifacts.

## Local checks

1) Knowledge integrity gate (manifest sha256)
```
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\gate-knowledge.ps1 -RepoRoot . -Mode local
```

2) Knowledge smoke (retriever + contract)
```
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\diag\knowledge-smoke.ps1 -RepoRoot . -Mode local
```

3) Full gate (includes knowledge gates)
```
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\gate.ps1 -RepoRoot . -Mode local
```

Artifacts are written to `audit\_latest`:
- `gate_knowledge_<stamp>.txt` and `.json`
- `knowledge_smoke_<stamp>.txt` and `.json`
- `summary.json` with `knowledge` metrics

## Prod smoke (post deploy)

Prereq: set bypass secret in process env (do not log or commit it).
```
$env:VERCEL_AUTOMATION_BYPASS_SECRET = '****'
```

Run:
```
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke\vercel-prod-smoke.ps1 -DeployUrl https://<your-app>.vercel.app
```

The script writes:
- `audit\_latest\vercel_prod_smoke_<stamp>.txt`
- `audit\_latest\vercel_prod_smoke_<stamp>.json`

## Notes
- Do not commit `audit/**` or `.env*`.
- `citationsUsed` is produced only by the retriever and must be >= 2 when requested.
