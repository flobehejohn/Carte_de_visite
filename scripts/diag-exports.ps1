[CmdletBinding()]
param(
    [string]$RepoRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ScriptDir "_auditRun.ps1")
$RepoRoot = Resolve-RepoRoot -RepoRoot $RepoRoot -ScriptDir $ScriptDir

Push-Location $RepoRoot
try {
    $tmpFile = Join-Path $RepoRoot ".diag-exports.mjs"
    $expr = @"
import * as m from './src/scene/RitualOrchestrator.js';
console.log('exports:', Object.keys(m));
console.log('default typeof:', typeof m.default);
"@

    Set-Content -LiteralPath $tmpFile -Value $expr -Encoding UTF8
    npx vite-node $tmpFile
    if ($LASTEXITCODE -ne 0) { throw "vite-node failed (exit=$LASTEXITCODE)" }
}
finally {
    if (Test-Path $tmpFile) { Remove-Item -LiteralPath $tmpFile -Force }
    Pop-Location
}
