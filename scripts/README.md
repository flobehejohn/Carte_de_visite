# Scripts

## Gate presets
- Command: `pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\gate-presets.ps1`
- Runs: TypeScript strict, two Vitest preset tests, and the presets audit.
- Outputs: `audit/presets/<timestamp>/...` and `audit/_latest/presets/...`

## Audit output convention
- Always write audit outputs under `audit/`.
- Use `audit/_latest/<domain>/...` for the most recent run.
- Use `audit/<domain>/<timestamp>/...` for historical runs.
