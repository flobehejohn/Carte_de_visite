# CI Runbook (validate-full / gate)

## Scope
- `scripts/validate-full.ps1`: pipeline (typecheck -> tests -> build -> audits)
- `scripts/gate.ps1`: strict wrapper (WARN = blocking)

## Commands (repo root)
```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-full.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-full.ps1 -Strict
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\gate.ps1
```

## Commands (any folder)
```powershell
$repo = "C:\ATLAS\INBOX\dev\R_D\carte_de_visite\test_unitaire\app_llmed"
Set-Location $env:TEMP
pwsh -NoProfile -ExecutionPolicy Bypass -File "$repo\scripts\validate-full.ps1" -RepoRoot "$repo"
pwsh -NoProfile -ExecutionPolicy Bypass -File "$repo\scripts\gate.ps1" -RepoRoot "$repo"
```

## Options
- `-RepoRoot`: repo root path (optional; fallback = script directory parent)
- `-OutDir`: base audit directory (default: `.\audit`)
- `-RunStamp`: run id (default: `VALID_yyyyMMdd_HHmmss`)
- `-Strict`: treat WARN as blocking (validate-full only)
- `-Mode`: `local` or `ci` (auto-detect when omitted)
- `-Archive`: keep unique run dir in local mode (default local = `_latest`)
- `-NoCleanLatest`: skip cleaning `_latest` before run (useful for wrapper scripts)

## Outputs
- Base: `audit\_latest\` (local) or `audit\<stamp>\` (archive/CI)
- Subfolders: `typecheck`, `tests`, `build`, `runtime`, `opacity`, `opacity_sinks`, `e2e`, `gate`
- Summary: `audit\<stamp>\summary.txt` and `audit\<stamp>\summary.json`
- Validate log: `audit\<stamp>\validate-full.log`
- Gate logs: `audit\<stamp>\gate\gate.log` and `audit\<stamp>\gate\validate-full.log`
- Tests junit: `audit\<stamp>\tests\junit.xml`
- Manifest: `audit\<stamp>\audit-manifest.json`
- Latest pointer: `audit\latest.txt`

## Exit codes
- `validate-full` (default): `0` if OK or WARN, `1` if ERR
- `validate-full -Strict`: `0` if OK, `1` if WARN or ERR
- `gate`: `0` if OK, `1` otherwise

## Troubleshooting
- **Invalid script path**: if you see `The argument '\scripts\validate-full.ps1' is not recognized`,
  pass `-RepoRoot` or call the script by absolute path (see "Commands (any folder)").
- **Execution policy**: use `-ExecutionPolicy Bypass` (already in runbook commands).
- **Node/npm**: `validate-full` logs detected `node` and `npm` versions in the run log.
- **Paths/quoting**: always quote Windows paths with spaces: `-RepoRoot "C:\path with spaces\repo"`.
- **Artifacts**: ensure `audit\<stamp>\summary.txt` exists; it lists each step and exit code.
