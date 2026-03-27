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
$Pwsh = Resolve-FirstCommandPath -Names @('pwsh.exe', 'pwsh', 'powershell.exe', 'powershell')

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

Invoke-LoggedCommand -Name 'verify.layer.governance' -FilePath $Pwsh -Arguments @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', '.\scripts\certification\Verify-LayerGovernance.ps1',
    '-RepoRoot', $ResolvedRepoRoot
)

$MandatoryVitestTargets = @(
    '.\src\components\oracle\Oracle3DScene.audit.integration.test.ts',
    '.\src\components\oracle\Oracle3DScene.cycle.test.tsx',
    '.\src\scene\modules\orbFluidParticles.contract.test.ts',
    '.\src\scene\modules\orbFluidParticles.exports.ast.test.ts',
    '.\src\scene\modules\orbFluidParticles.integration.test.ts',
    '.\src\scene\render\optics\transparency.test.ts',
    '.\src\scene\render\materials\applyMaterials.integration.test.ts'
)

$OptionalVitestTargets = @(
    '.\src\scene\RitualOrchestrator.opacityWiring.test.js',
    '.\src\scene\RitualOrchestrator.orderLock.test.js'
)

foreach ($target in $MandatoryVitestTargets) {
    if (-not (Test-Path $target)) {
        throw "Test manquant : $target"
    }

    $leafBase = [IO.Path]::GetFileNameWithoutExtension($target)
    $safeName = ('vitest.' + $leafBase).Replace(' ', '_')

    Invoke-LoggedCommand -Name $safeName -FilePath $Npx -Arguments @(
        'vitest',
        'run',
        $target
    )
}

foreach ($target in $OptionalVitestTargets) {
    if (Test-Path $target) {
        $leafBase = [IO.Path]::GetFileNameWithoutExtension($target)
        $safeName = ('vitest.' + $leafBase).Replace(' ', '_')

        Invoke-LoggedCommand -Name $safeName -FilePath $Npx -Arguments @(
            'vitest',
            'run',
            $target
        )
    }
}

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
Write-Host 'Phase 2 & 3 Oracle3D audit gate: OK' -ForegroundColor Green
Write-Host "Logs: $OutDir" -ForegroundColor DarkGray

if ($PassThru) {
    $Summary
}