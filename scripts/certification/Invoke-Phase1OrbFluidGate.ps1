[CmdletBinding()]
param(
    [string]$RepoRoot = (Get-Location).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path $RepoRoot).Path
Set-Location $RepoRoot

$Stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$OutDir = Join-Path $RepoRoot "artifacts\certification\phase1-orbfluid\$Stamp"
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

function Invoke-LoggedCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $LogPath = Join-Path $OutDir "$Name.log"
    Write-Host "==> $Name" -ForegroundColor Cyan

    & $FilePath @Arguments *>&1 | Tee-Object -FilePath $LogPath

    if ($LASTEXITCODE -ne 0) {
        throw "Echec de l'étape '$Name' (exit=$LASTEXITCODE). Voir $LogPath"
    }
}

$npmCmd = (Get-Command npm.cmd -ErrorAction Stop).Source
$npxCmd = (Get-Command npx.cmd -ErrorAction Stop).Source

Invoke-LoggedCommand -Name 'typecheck' `
    -FilePath $npmCmd `
    -Arguments @('run', 'typecheck')

Invoke-LoggedCommand -Name 'vitest.orbFluid.contract' `
    -FilePath $npxCmd `
    -Arguments @('vitest', 'run', 'src/scene/modules/orbFluidParticles.contract.test.ts')

Invoke-LoggedCommand -Name 'vitest.orbFluid.exports.ast' `
    -FilePath $npxCmd `
    -Arguments @('vitest', 'run', 'src/scene/modules/orbFluidParticles.exports.ast.test.ts')

Invoke-LoggedCommand -Name 'vitest.orbFluid.integration' `
    -FilePath $npxCmd `
    -Arguments @('vitest', 'run', 'src/scene/modules/orbFluidParticles.integration.test.ts')

Invoke-LoggedCommand -Name 'vitest.oracle3d.audit' `
    -FilePath $npxCmd `
    -Arguments @('vitest', 'run', 'src/components/oracle/Oracle3DScene.audit.integration.test.ts')

Invoke-LoggedCommand -Name 'vitest.full' `
    -FilePath $npxCmd `
    -Arguments @('vitest', 'run')

$HashTargets = @(
    '.\src\scene\modules\orbFluidParticles.js',
    '.\src\scene\modules\orbFluidParticles.d.ts',
    '.\src\scene\modules\orbFluidParticles.contract.test.ts',
    '.\src\scene\modules\orbFluidParticles.exports.ast.test.ts',
    '.\src\scene\modules\orbFluidParticles.integration.test.ts',
    '.\src\components\oracle\Oracle3DScene.audit.integration.test.ts',
    '.\tsconfig.client.json',
    '.\tsconfig.server.json'
) | ForEach-Object { Join-Path $RepoRoot $_ } | Where-Object { Test-Path $_ }

Get-FileHash -Algorithm SHA256 $HashTargets |
Select-Object Path, Algorithm, Hash |
Export-Csv (Join-Path $OutDir 'hashes.csv') -NoTypeInformation -Encoding UTF8

try {
    git status --short --branch | Set-Content (Join-Path $OutDir 'git-status.txt') -Encoding UTF8
    git rev-parse HEAD | Set-Content (Join-Path $OutDir 'git-head.txt') -Encoding UTF8
}
catch {
    Write-Warning "Git indisponible, capture git ignorée."
}

Get-Content .\tsconfig.client.json | Set-Content (Join-Path $OutDir 'tsconfig.client.json.txt') -Encoding UTF8
Get-Content .\tsconfig.server.json | Set-Content (Join-Path $OutDir 'tsconfig.server.json.txt') -Encoding UTF8

$BuildSymbolHits = Get-ChildItem .\src -Recurse -File -Include *.ts, *.tsx |
Select-String -Pattern '\bbuildFluidParticles\b'

if ($BuildSymbolHits) {
    $BuildSymbolHits |
    Select-Object Path, LineNumber, Line |
    Format-Table -AutoSize |
    Out-String |
    Set-Content (Join-Path $OutDir 'buildFluidParticles-ts-usage.txt') -Encoding UTF8
}
else {
    'No TS/TSX imports or references to buildFluidParticles were found.' |
    Set-Content (Join-Path $OutDir 'buildFluidParticles-ts-usage.txt') -Encoding UTF8
}

@"
# Phase 1 — OrbFluid gate

- Timestamp: $Stamp
- Typecheck: PASS
- orbFluid contract: PASS
- orbFluid exports AST: PASS
- orbFluid integration: PASS
- Oracle3D audit: PASS
- Full vitest: PASS

Résultat:
Le blocage TS7016 ciblé par la phase 1 est fermé.
Le contrat public minimal est déclaré.
La cohérence runtime / AST / audit est validée.
"@ | Set-Content (Join-Path $OutDir 'summary.md') -Encoding UTF8

Write-Host ""
Write-Host "PHASE 1 VALIDEE" -ForegroundColor Green
Write-Host "Artifacts: $OutDir" -ForegroundColor Green