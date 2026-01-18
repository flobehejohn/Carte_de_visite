# Scripts

OPTICS1: single-writer transparency pipeline (applyMaterials only).

## Gate presets
- Command: `pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\gate-presets.ps1`
- Runs: TypeScript strict, two Vitest preset tests, and the presets audit.
- Outputs: `audit/presets/<timestamp>/...` and `audit/_latest/presets/...`

## Gate render
- Command: `pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\gate-render.ps1`
- Runs: TypeScript strict, render param map test, transparency test, applyMaterials integration test, and the render params audit.
- Outputs: `audit/render_params/<timestamp>/...` and `audit/_latest/render_params/...`

## Audit output convention
- Always write audit outputs under `audit/`.
- Use `audit/_latest/<domain>/...` for the most recent run.
- Use `audit/<domain>/<timestamp>/...` for historical runs.

## HOW TO VERIFY
- `npx tsc -p tsconfig.json --noEmit`
- `npx vitest run`
- `pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\gate-render.ps1`
- `pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\gate-presets.ps1`
- `pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\gate.ps1`
- `pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\cleanup-audit.ps1 -Keep 3`
