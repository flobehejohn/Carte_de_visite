Fiesta CI audit and gate

Overview

- Single entrypoint to reproduce CI locally and generate audit artifacts.
- Artifacts live under audit/fiesta/<RUNSTAMP>/.

Local run

- pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/ci/fiesta-gate.ps1 -Mode local

CI run

- pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/ci/fiesta-gate.ps1 -Mode ci

Install behavior

- CI: always runs npm ci inside fiesta-audit.
- Local: runs npm ci only if node_modules is missing.

Artifacts

- env.json: node/npm/pwsh versions, OS, reduced PATH snapshot
- git.json: branch, head, status, diffstat
- npm.json: scripts, lockfile hash, npm ls --depth=0 (post-install)
- steps.log: human-readable log
- summary.json: verdict + per-step exit codes + log file paths

Verdicts

- OK: all steps OK
- WARN: one or more steps WARN, exit 0
- FAIL: at least one step FAIL, exit 1

Troubleshooting

- npm ci slow: rely on setup-node cache, increase job timeout-minutes
- vitest/tsc not found: npm ci did not complete; see audit/fiesta/<RUNSTAMP>/steps/npm-ci.log
- tests not discovered: check vitest.config.ts include/exclude and src/ci/fiesta.discovery.test.ts
  Notes
- No secrets are logged.
