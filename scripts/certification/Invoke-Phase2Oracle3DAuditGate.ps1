[CmdletBinding()]
param(
    [string]$RepoRoot = (Get-Location).Path,
    [switch]$SkipNpmInstall,
    [switch]$SkipFullVitest,
    [switch]$PassThru
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ResolvedRepoRoot = (Resolve-Path $RepoRoot).Path
Set-Location $ResolvedRepoRoot

$Stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$OutDir = Join-Path $ResolvedRepoRoot "artifacts\certification\phase2-oracle3d-audit\$Stamp"
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

function Resolve-FirstCommandPath {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Names
    )

    foreach ($name in $Names) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($null -ne $cmd) {
            return $cmd.Source
        }
    }

    throw "Impossible de résoudre une commande parmi : $($Names -join ', ')"
}

$Npm = Resolve-FirstCommandPath -Names @('npm.cmd', 'npm')
$Npx = Resolve-FirstCommandPath -Names @('npx.cmd', 'npx')

function Invoke-LoggedCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $LogPath = Join-Path $OutDir "$Name.log"

    Write-Host "==> $Name" -ForegroundColor Cyan
    & $FilePath @Arguments 2>&1 | Tee-Object -FilePath $LogPath

    if ($LASTEXITCODE -ne 0) {
        throw "Echec de l'étape '$Name' (exit=$LASTEXITCODE). Voir $LogPath"
    }
}

if (-not $SkipNpmInstall) {
    Invoke-LoggedCommand -Name 'npm.ci' -FilePath $Npm -Arguments @('ci')
}

Invoke-LoggedCommand -Name 'typecheck' -FilePath $Npm -Arguments @('run', 'typecheck')

Invoke-LoggedCommand -Name 'vitest.oracle3d.audit' -FilePath $Npx -Arguments @(
    'vitest',
    'run',
    '.\src\components\oracle\Oracle3DScene.audit.integration.test.ts'
)

Invoke-LoggedCommand -Name 'vitest.orbFluid.contract' -FilePath $Npx -Arguments @(
    'vitest',
    'run',
    '.\src\scene\modules\orbFluidParticles.contract.test.ts'
)

Invoke-LoggedCommand -Name 'vitest.orbFluid.exports.ast' -FilePath $Npx -Arguments @(
    'vitest',
    'run',
    '.\src\scene\modules\orbFluidParticles.exports.ast.test.ts'
)

Invoke-LoggedCommand -Name 'vitest.orbFluid.integration' -FilePath $Npx -Arguments @(
    'vitest',
    'run',
    '.\src\scene\modules\orbFluidParticles.integration.test.ts'
)

Invoke-LoggedCommand -Name 'vitest.transparency' -FilePath $Npx -Arguments @(
    'vitest',
    'run',
    '.\src\scene\render\optics\transparency.test.ts'
)

if (-not $SkipFullVitest) {
    Invoke-LoggedCommand -Name 'vitest.full' -FilePath $Npx -Arguments @(
        'vitest',
        'run'
    )
}

$Summary = [ordered]@{
    repoRoot       = $ResolvedRepoRoot
    generatedAt    = (Get-Date).ToString('o')
    outDir         = $OutDir
    skipNpmInstall = [bool]$SkipNpmInstall
    skipFullVitest = [bool]$SkipFullVitest
    status         = 'OK'
}

$SummaryPath = Join-Path $OutDir 'summary.json'
$Summary | ConvertTo-Json -Depth 5 | Set-Content -Path $SummaryPath -Encoding utf8

Write-Host ''
Write-Host 'Phase 2 Oracle3D audit gate: OK' -ForegroundColor Green
Write-Host "Logs: $OutDir" -ForegroundColor DarkGray

if ($PassThru) {
    $Summary
}