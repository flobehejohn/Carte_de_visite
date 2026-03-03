# vercel-e2e (smoke) - usage terminal + CI

Purpose:
- Validate Vercel app -> POST /api/gemini -> LLM -> citations from corpus.
- Works with Deployment Protection using vercel curl and bypass header when present.

Local usage (preview deploy + test):
- pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/diag/vercel-e2e.ps1 -RepoRoot . -Deploy -Policy warn

Local usage (existing deploy URL):
- pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/diag/vercel-e2e.ps1 -RepoRoot . -DeployUrl "https://<preview>.vercel.app" -Policy warn

CI usage (optional step, no deploy):
- Set env: CI_VERCEL_E2E=1
- Set env: VERCEL_E2E_DEPLOY_URL=https://<preview>.vercel.app
- Optional bypass secret via env (do not print): VERCEL_AUTOMATION_BYPASS_SECRET
- Run validate-full.ps1 (vercel-e2e step will execute only when CI_VERCEL_E2E=1)

Outputs:
- audit/_latest/smoke/vercel_e2e_<stamp>.log
- audit/_latest/smoke/vercel_e2e_<stamp>.json

Notes:
- No secrets are printed or stored.
- If CI_VERCEL_E2E=1 and VERCEL_E2E_DEPLOY_URL is missing, the step will warn/fail based on Policy.
