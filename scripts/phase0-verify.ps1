[CmdletBinding()]
param(
    [string]$RepoRoot = "",
    [switch]$SkipDocker
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Detect-RepoRoot {
    if (-not [string]::IsNullOrWhiteSpace($RepoRoot)) { return (Resolve-Path -LiteralPath $RepoRoot).Path }
    try {
        $top = (& git rev-parse --show-toplevel) 2>$null
        if ($LASTEXITCODE -eq 0 -and $top) { return (Resolve-Path -LiteralPath $top.Trim()).Path }
    }
    catch {}
    return (Resolve-Path -LiteralPath ".").Path
}

function Run-Step([string]$name, [scriptblock]$fn) {
    try {
        & $fn
        [pscustomobject]@{ step = $name; ok = $true; detail = "" }
    }
    catch {
        [pscustomobject]@{ step = $name; ok = $false; detail = $_.Exception.Message }
    }
}

function Parse-PsFile([string]$p) {
    $full = (Resolve-Path -LiteralPath $p).Path
    $tokens = $null; $errs = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($full, [ref]$tokens, [ref]$errs)
    if ($errs -and $errs.Count -gt 0) {
        $errs | Select-Object -First 8 | Format-List Message, Extent | Out-String | Write-Host
        throw "ParserError: $p"
    }
}

$repo = Detect-RepoRoot
Push-Location $repo
try {
    $stamp = "PH0_{0:yyyyMMdd_HHmmss}" -f (Get-Date)
    $auditRoot = Join-Path $repo "audit\phase0\$stamp"
    New-Item -ItemType Directory -Force -Path $auditRoot | Out-Null

    $steps = @()

    $steps += Run-Step "Parse LintAnalytics.psm1" {
        Parse-PsFile (Join-Path $repo "scripts\lint\LintAnalytics.psm1")
    }

    $steps += Run-Step "Parse audit-lint.ps1" {
        Parse-PsFile (Join-Path $repo "scripts\audit-lint.ps1")
    }

    $steps += Run-Step "audit-lint (artefacts)" {
        $log = Join-Path $auditRoot "audit-lint.log"
        pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\audit-lint.ps1 -FixDryRun -WithImportGraph *>&1 |
        Tee-Object -FilePath $log | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "audit-lint exit=$LASTEXITCODE (voir $log)" }
    }

    $steps += Run-Step "npm run lint" {
        $log = Join-Path $auditRoot "npm-lint.log"
        npm run lint *>&1 | Tee-Object -FilePath $log | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "npm run lint exit=$LASTEXITCODE (voir $log)" }
    }

    $steps += Run-Step "validate-full" {
        $log = Join-Path $auditRoot "validate-full.log"
        pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-full.ps1 -Quiet:$false *>&1 |
        Tee-Object -FilePath $log | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "validate-full exit=$LASTEXITCODE (voir $log)" }
    }

    $steps += Run-Step "ci-smoke -IncludeTags smoke" {
        $log = Join-Path $auditRoot "ci-smoke_smoke.log"
        pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\ci-smoke.ps1 -IncludeTags smoke *>&1 |
        Tee-Object -FilePath $log | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "ci-smoke smoke exit=$LASTEXITCODE (voir $log)" }
    }

    $steps += Run-Step "ci-smoke -IncludeTags full" {
        $log = Join-Path $auditRoot "ci-smoke_full.log"
        pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\ci-smoke.ps1 -IncludeTags full *>&1 |
        Tee-Object -FilePath $log | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "ci-smoke full exit=$LASTEXITCODE (voir $log)" }
    }

    $steps += Run-Step "Docker (optionnel)" {
        if ($SkipDocker) { return }
        $null = (& docker version) 2>$null
        if ($LASTEXITCODE -ne 0) { throw "Docker down -> OK si tu assumes SKIP (relance avec -SkipDocker)" }
    }

    $steps | Format-Table -AutoSize

    $failed = @($steps | Where-Object { -not $_.ok })
    if ($failed.Count -gt 0) {
        Write-Host ""
        Write-Host "[ERR] Phase 0 KO. Logs: $auditRoot" -ForegroundColor Red
        exit 1
    }

    Write-Host ""
    Write-Host "[OK] Phase 0 VALID. Logs: $auditRoot" -ForegroundColor Green
    exit 0
}
finally {
    Pop-Location
}
