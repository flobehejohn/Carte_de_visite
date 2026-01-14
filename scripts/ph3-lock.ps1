[CmdletBinding()]
param(
    [string]$RepoRoot = "",
    [string]$OutDir = ".\audit",
    [string]$RunStamp = "",
    [string]$Mode = "",
    [switch]$Archive
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ScriptDir "_auditRun.ps1")

function Exec([string]$Label, [scriptblock]$Command) {
    Write-Host "==> $Label"
    $global:LASTEXITCODE = 0
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try { & $Command }
    catch { $sw.Stop(); throw "$Label failed: $($_.Exception.Message)" }
    $sw.Stop()
    if ($LASTEXITCODE -ne 0) { throw "$Label failed (exit=$LASTEXITCODE)" }
    return [pscustomobject]@{
        Step       = $Label
        ExitCode   = $LASTEXITCODE
        DurationMs = [Math]::Round($sw.Elapsed.TotalMilliseconds, 0)
    }
}

function Assert-OrderText([string]$FilePath) {
    if (-not (Test-Path $FilePath)) { throw "File not found: $FilePath" }
    $text = Get-Content -LiteralPath $FilePath -Raw -Encoding UTF8
    $matches = [regex]::Matches($text, "this\.applyTargetsToRuntime\s*\(")
    if ($matches.Count -ne 2) { throw "Expected 2 applyTargetsToRuntime calls, found $($matches.Count)" }
    $firstIdx = $matches[0].Index
    $secondIdx = $matches[1].Index
    $safetyIdx = $text.IndexOf("const safetyFactor")
    if ($safetyIdx -lt 0) { throw "Missing 'const safetyFactor' in update block" }
    if (-not ($firstIdx -lt $safetyIdx -and $safetyIdx -lt $secondIdx)) {
        throw "Order invalid: applyTargetsToRuntime -> safetyFactor -> applyTargetsToRuntime"
    }
}

$audit = Resolve-AuditRun -RepoRoot $RepoRoot -OutDir $OutDir -RunStamp $RunStamp -Mode $Mode -Archive:$Archive -Category "PH3" -Prefix "PH3" -CleanLatest
$RepoRoot = $audit.RepoRoot
$runDir = $audit.RunDir

$testsList = Join-Path $runDir "tests_files_list.txt"
$orderTestRel = "src\scene\RitualOrchestrator.orderLock.test.js"
Set-Content -LiteralPath $testsList -Value $orderTestRel -Encoding UTF8

$auditRuntime = Join-Path $ScriptDir "audit-runtime.ps1"
$gateScript = Join-Path $ScriptDir "gate.ps1"
$orderFile = Join-Path $RepoRoot "src\scene\RitualOrchestrator.js"
$runtimeOut = Join-Path $runDir "runtime"
Ensure-Dir $runtimeOut

Push-Location $RepoRoot
try {
    $steps = @()
    $steps += Exec "orderLock test" {
        npx vitest run $orderTestRel
    }

    $steps += Exec "audit-runtime (PH3_LOCK)" {
        pwsh -NoProfile -ExecutionPolicy Bypass -File $auditRuntime -RepoRoot $RepoRoot -OutDir $runtimeOut -RunStamp "PH3_LOCK"
    }

    $steps += Exec "order textual check" {
        Assert-OrderText $orderFile
    }

    $steps += Exec "gate (strict)" {
        pwsh -NoProfile -ExecutionPolicy Bypass -File $gateScript -RepoRoot $RepoRoot -OutDir $audit.BaseDir -RunStamp $audit.RunStamp -Mode $audit.Mode -Archive:$audit.Archive -NoCleanLatest
    }

    Write-AuditManifest -Path $audit.Manifest -Payload @{
        timestamp = $audit.Timestamp
        runStamp  = $audit.RunStamp
        repoRoot  = $RepoRoot
        outDir    = $audit.OutDir
        runDir    = $runDir
        mode      = $audit.Mode
        archive   = [bool]$audit.Archive
        git       = $audit.Git
        steps     = $steps
        overall   = "OK"
    }

    $latestPath = Join-Path $audit.BaseDir "latest.txt"
    Set-Content -LiteralPath $latestPath -Value $runDir -Encoding UTF8
}
finally {
    Pop-Location
}
