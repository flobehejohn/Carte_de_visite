[CmdletBinding()]
param(
    [string]$Root = "",
    [string]$Pattern = "src/scene",
    [string]$OutDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($Root)) {
    $Root = (Resolve-Path (Join-Path $ScriptDir "..")).Path
}
else {
    $Root = (Resolve-Path $Root).Path
}

$patternRoot = $Pattern
if (-not [System.IO.Path]::IsPathRooted($patternRoot)) {
    $patternRoot = Join-Path $Root $patternRoot
}
if (-not (Test-Path $patternRoot)) {
    throw "Pattern root not found: $patternRoot"
}

$files = Get-ChildItem -Path $patternRoot -Recurse -File -Include "*.test.*" | Sort-Object FullName
if (-not $files -or $files.Count -eq 0) {
    throw "No tests found under: $patternRoot"
}

if (-not [string]::IsNullOrWhiteSpace($OutDir)) {
    $outAbs = if ([System.IO.Path]::IsPathRooted($OutDir)) { $OutDir } else { Join-Path $Root $OutDir }
    if (-not (Test-Path $outAbs)) { New-Item -ItemType Directory -Force -Path $outAbs | Out-Null }
    $listPath = Join-Path $outAbs "tests_files_list.txt"
    $files | ForEach-Object { $_.FullName } | Set-Content -LiteralPath $listPath -Encoding UTF8
}

Push-Location $Root
try {
    foreach ($file in $files) {
        Write-Host "==> vitest run $($file.FullName)"
        $global:LASTEXITCODE = 0
        npx vitest run $file.FullName
        if ($LASTEXITCODE -ne 0) { throw "vitest failed for $($file.FullName) (exit=$LASTEXITCODE)" }
    }
}
finally {
    Pop-Location
}
