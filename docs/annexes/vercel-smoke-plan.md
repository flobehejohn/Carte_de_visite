# Vercel Smoke Plan (Preview + Prod)

What:
- Diagnose Deployment Protection issues on preview URLs and define a terminal-only smoke strategy using vercel curl.

Problem (Deployment Protection):
- Preview deployments can be protected and return HTML auth pages or 401/403.
- Invoke-RestMethod fails because it expects JSON and does not pass Vercel auth/bypass.
- vercel curl uses CLI auth context and can include the protection bypass header.

Procedure (PowerShell, preview/prod):
1) Ensure Vercel CLI is installed and logged in.
2) Identify deploy URL (preview or prod).
3) Use vercel curl with protection bypass header when required.

Example (preview with protection bypass):
- $env:VERCEL_AUTOMATION_BYPASS_SECRET = "<set in CI or local env>"
- vercel curl https://<preview-url>/
- vercel curl -H "x-vercel-protection-bypass: $env:VERCEL_AUTOMATION_BYPASS_SECRET" https://<preview-url>/api/gemini -d '{"mode":"oracle","prompt":"Rituel: je franchis le seuil.","wantCitations":true}'

Example (prod, if protected):
- vercel curl -H "x-vercel-protection-bypass: $env:VERCEL_AUTOMATION_BYPASS_SECRET" https://<prod-url>/api/gemini -d '{"mode":"oracle","prompt":"Rituel: je franchis le seuil.","wantCitations":true}'

Prereq checklist (no secrets here):
- Vercel CLI login OK (vercel whoami).
- .vercel/project.json exists (project linked).
- Vercel env vars set in Vercel UI:
  - GEMINI_API_KEY (or GOOGLE_API_KEY)
  - VERCEL_AUTOMATION_BYPASS_SECRET (for protected preview/prod)
- buildCommand and outputDirectory match vercel.json.

CI strategy (optional, no implementation here):
- Add a step gated by env var CI_VERCEL_E2E=1.
- Step runs a future script scripts/diag/vercel-e2e.ps1 (not created here).
- Exit codes: 0 OK, 2 WARN, 1 FAIL.
- Artifacts: audit/_latest/smoke/vercel_e2e_<stamp>.{log,json}.
- Avoid running on every PR: use nightly or manual job trigger; reuse existing deploy URL if available.

Troubleshooting:
- If vercel curl returns HTML: Deployment Protection still enabled or bypass header missing.
- If /api/gemini returns 404: routing misconfig or function not deployed.
- If response has jsonError: check GEMINI_API_KEY and Oracle schema contract.
- If citationsUsed is empty: knowledge retriever/corpus issue (run knowledge-smoke locally).

Security Do/Don’t:
- Do not echo secrets in logs (bypass token, API keys).
- Do not commit .env or .vercel/*.local.
- Do use environment variables in CI and mask them in logs.
