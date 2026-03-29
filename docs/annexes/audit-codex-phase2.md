# Audit Phase 2 - Knowledge Layer (Codex)

What:
- Document how to run Phase 2 knowledge gates and where to read audit artifacts.

Evidence:
- scripts/gate-knowledge.ps1 and scripts/diag/knowledge-smoke.ps1 exist and are called by validate-full.
- audit/_latest/_validate/knowledge contains gate logs for knowledge checks.

Root cause:
- N/A (documentation).

Risk:
- If Phase 2 gates are not run, knowledge regressions can slip.

Recommendation:
- Run the commands below for local verification; archive audit/_latest.

Next command:
- pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/diag/knowledge-smoke.ps1 -RepoRoot . -Policy warn

Commands (local):
- pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/gate-knowledge.ps1 -RepoRoot . -Policy warn
- pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/diag/knowledge-smoke.ps1 -RepoRoot . -Policy warn
- pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/validate-full.ps1 -RepoRoot . -Mode local -NoCleanLatest

Artifacts:
- audit/_latest/gate_knowledge_VALID_*.{txt,json,log}
- audit/_latest/knowledge_smoke_VALID_*.{txt,json,log}
- audit/_latest/_validate/knowledge/knowledge-smoke.log
- audit/_latest/summary.json (knowledge KPIs when metrics succeed)
