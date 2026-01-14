# CI Audit Policy

## Goals
- Keep local runs idempotent (no audit directory explosion).
- Keep CI runs traceable (unique run dir, manifest).
- Preserve current log format: `[INFO]`, `[OK]`, `[WARN]`, `[ERR]`.

## Modes
### Local (default)
- Run directory: `audit\_latest\`
- RunStamp forced to `LATEST`
- Files are overwritten on each run
- Use `-Archive` to keep a unique run directory
- Use `-NoCleanLatest` in wrappers that need to preserve earlier artifacts

### CI (auto-detected)
- Run directory: `audit\VALID_<timestamp>_<sha>_<runId>\` (prefix may differ per script)
- RunStamp includes git short SHA and CI run id when available
- `audit\latest.txt` points to the latest run directory

Auto-detection checks common CI env vars (`CI`, `GITHUB_ACTIONS`, `GITLAB_CI`, `TF_BUILD`, etc).
Override with `-Mode local` or `-Mode ci`.

## Where artifacts live
- Summary: `audit\<run>\summary.txt`, `audit\<run>\summary.json`
- Manifest: `audit\<run>\audit-manifest.json`
- Gate logs: `audit\<run>\gate\gate.log`
- Audit outputs: `audit\<run>\runtime\`, `audit\<run>\opacity\`, `audit\<run>\opacity_sinks\`

## Golden path commands
```powershell
# local (idempotent)
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-full.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\gate.ps1

# local with archive
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-full.ps1 -Archive

# CI (force)
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\gate.ps1 -Mode ci

# PH3 lock
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\ph3-lock.ps1
```

## Cleanup / retention
```powershell
# keep last 10 (default), dry-run
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\cleanup-audit.ps1 -WhatIf

# keep last 20 and last 7 days, zip before delete
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\cleanup-audit.ps1 -KeepLast 20 -KeepDays 7 -Zip
```

## Diagnostics
```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\diag-exports.ps1
```
