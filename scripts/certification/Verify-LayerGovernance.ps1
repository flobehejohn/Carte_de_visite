[CmdletBinding()]
param(
    [string]$RepoRoot = (Get-Location).Path,
    [switch]$IncludeTests,
    [switch]$PassThru
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ResolvedRepoRoot = (Resolve-Path $RepoRoot).Path
Set-Location $ResolvedRepoRoot

$TargetDir = Join-Path $ResolvedRepoRoot 'src'
if (-not (Test-Path $TargetDir)) {
    throw "Répertoire introuvable : $TargetDir"
}

$AllowedLayerWriterSuffixes = @(
    'src\components\oracle\Oracle3DScene.tsx',
    'src\scene\modules\orbFluidParticles.js',
    'src\components\oracle\Oracle3DScene.audit.integration.test.ts'
)

$AllowedLayerWriters = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
foreach ($suffix in $AllowedLayerWriterSuffixes) {
    $fullPath = Join-Path $ResolvedRepoRoot $suffix
    [void]$AllowedLayerWriters.Add($fullPath)
}

$LayerMethodPattern = '\.layers\.(set|enable|disable|toggle)\s*\('
$LayerMaskWritePattern = '\.layers\.mask\s*='
$ExcludedTestPattern = '\.(test|spec)\.(ts|tsx|js|jsx)$'

$SourceFiles = Get-ChildItem -Path $TargetDir -Recurse -File | Where-Object {
    $_.Extension -in '.ts', '.tsx', '.js', '.jsx' -and
    $_.Name -notlike '*.d.ts' -and
    (
        $IncludeTests -or
        ($_.Name -notmatch $ExcludedTestPattern)
    )
}

$Hits = $SourceFiles | Select-String -Pattern @(
    $LayerMethodPattern,
    $LayerMaskWritePattern
) -AllMatches

$Observed = New-Object 'System.Collections.Generic.List[object]'
$Violations = New-Object 'System.Collections.Generic.List[object]'

foreach ($hit in $Hits) {
    $resolvedPath = (Resolve-Path $hit.Path).Path
    $trimmedLine = $hit.Line.Trim()

    $record = [pscustomobject]@{
        Path       = $resolvedPath
        LineNumber = $hit.LineNumber
        Line       = $trimmedLine
    }

    [void]$Observed.Add($record)

    $isAllowedWriter = $AllowedLayerWriters.Contains($resolvedPath)
    $isDirectMaskWrite = $trimmedLine -match $LayerMaskWritePattern

    if ($isDirectMaskWrite -or -not $isAllowedWriter) {
        [void]$Violations.Add($record)
    }
}

$Summary = [pscustomobject]@{
    RepoRoot         = $ResolvedRepoRoot
    ScannedFileCount = $SourceFiles.Count
    IncludeTests     = [bool]$IncludeTests
    ObservedWriters  = $Observed.Count
    ViolationCount   = $Violations.Count
    AllowedWriters   = @($AllowedLayerWriterSuffixes)
}

Write-Host "==> Audit de gouvernance des Render Layers..." -ForegroundColor Cyan
Write-Host ("Fichiers scannés : {0}" -f $Summary.ScannedFileCount) -ForegroundColor DarkGray
Write-Host ("Tests inclus   : {0}" -f $Summary.IncludeTests) -ForegroundColor DarkGray

if ($Observed.Count -gt 0) {
    Write-Host "Writers observés :" -ForegroundColor DarkGray
    foreach ($row in ($Observed | Sort-Object Path, LineNumber)) {
        Write-Host (" - {0}:{1} :: {2}" -f $row.Path, $row.LineNumber, $row.Line)
    }
}
else {
    Write-Host "Aucune écriture de layer détectée." -ForegroundColor Yellow
}

if ($Violations.Count -gt 0) {
    Write-Host ''
    Write-Host "❌ VIOLATION ARCHITECTURALE : writer de layer non autorisé ou écriture directe de mask." -ForegroundColor Red
    foreach ($row in ($Violations | Sort-Object Path, LineNumber)) {
        Write-Host (" - {0}:{1} :: {2}" -f $row.Path, $row.LineNumber, $row.Line) -ForegroundColor Yellow
    }

    if ($PassThru) {
        $Summary
    }

    exit 1
}

Write-Host ''
Write-Host "✅ Gouvernance des Render Layers respectée." -ForegroundColor Green

if ($PassThru) {
    $Summary
}