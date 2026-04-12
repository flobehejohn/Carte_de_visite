[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$RepoRoot = "",

    [string]$OutDir = ".\audit",
    [string]$RunStamp = "",
    [switch]$Strict,
    [string]$Mode = "",
    [switch]$Archive,
    [switch]$NoCleanLatest,
    [switch]$Quiet,

    # Phase 0: dirty policy configurable
    [ValidateSet("auto", "warn", "fail", "off")]
    [string]$DirtyPolicy = "auto",

    # Audits (observabilité)
    [ValidateSet("warn", "fail", "off")]
    [string]$AuditPolicy = "warn",

    # Lint (Phase 0: mesure sans bloquer)
    [ValidateSet("warn", "fail", "off")]
    [string]$LintPolicy = "warn"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ScriptDir "_lib\Log.ps1")
. (Join-Path $ScriptDir "_auditRun.ps1")

$log = New-LogState
if (-not $PSBoundParameters.ContainsKey("Quiet")) { $Quiet = $true }
if ($Quiet) { $VerbosePreference = "SilentlyContinue" }

function Get-OverallStatus([object[]]$steps) {
    if ($steps | Where-Object { $_.Status -eq "ERR" }) { return "ERR" }
    if ($steps | Where-Object { $_.Status -eq "WARN" }) { return "WARN" }
    return "OK"
}

function New-StepResult {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][ValidateSet("OK", "WARN", "ERR", "SKIP")][string]$Status,
        [int]$ExitCode = 0,
        [int]$DurationMs = 0,
        [string]$LogPath = "",
        [string]$Command = "",
        [string]$Note = ""
    )
    return [pscustomobject]@{
        Name       = $Name
        Status     = $Status
        ExitCode   = $ExitCode
        DurationMs = $DurationMs
        LogPath    = $LogPath
        Command    = $Command
        Note       = $Note
    }
}

function Write-TextFile([string]$Path, [string[]]$Lines) {
    $dir = Split-Path -Parent $Path
    if ($dir) { Ensure-Dir $dir }
    Set-Content -LiteralPath $Path -Value ($Lines -join "`r`n") -Encoding UTF8
}

function Try-GetGitBranch([string]$RepoRoot) {
    try {
        Push-Location $RepoRoot
        $b = (git rev-parse --abbrev-ref HEAD) 2>$null
        Pop-Location
        if ($b) { return $b.Trim() }
    }
    catch {}
    return ""
}

function Test-GitDirty([string]$RepoRoot) {
    try {
        Push-Location $RepoRoot
        $s = (git status --porcelain) 2>$null
        Pop-Location
        if ($s -and ($s | Measure-Object).Count -gt 0) { return $true }
    }
    catch {}
    return $false
}

function Resolve-DirtyPolicy([string]$Requested, [string]$Branch) {
    $envPolicy = $env:CI_DIRTY_POLICY
    $p = $Requested
    if (-not $p -or $p -eq "") { $p = "auto" }
    if ($envPolicy -and $envPolicy.Trim() -ne "") { $p = $envPolicy.Trim().ToLowerInvariant() }

    if ($p -ne "auto") { return $p }

    $isCI = $false
    try {
        if ($env:CI -and $env:CI.ToString().ToLowerInvariant() -eq "true") { $isCI = $true }
        if ($env:GITHUB_ACTIONS -and $env:GITHUB_ACTIONS.ToString().ToLowerInvariant() -eq "true") { $isCI = $true }
    }
    catch {}

    if ($isCI) { return "fail" }
    if ($Branch -and ($Branch -eq "main" -or $Branch -eq "master")) { return "fail" }
    return "warn"
}

function Resolve-Policy3([string]$Requested, [string]$EnvVar, [string]$Default = "warn") {
    $p = $Requested
    if (-not $p -or $p.Trim() -eq "") { $p = $Default }

    # ✅ FIX: lecture env var robuste (évite .Value sur objet inattendu)
    $envPolicy = [Environment]::GetEnvironmentVariable($EnvVar)
    if ($envPolicy -and $envPolicy.Trim() -ne "") { $p = $envPolicy.Trim().ToLowerInvariant() }

    if ($p -in @("warn", "fail", "off")) { return $p }
    return $Default
}

function Select-PackageManager([string]$RepoRoot) {
    $hasPnpmLock = Test-Path -LiteralPath (Join-Path $RepoRoot "pnpm-lock.yaml")
    $hasYarnLock = Test-Path -LiteralPath (Join-Path $RepoRoot "yarn.lock")

    $pnpm = (Get-Command pnpm -ErrorAction SilentlyContinue)
    $yarn = (Get-Command yarn -ErrorAction SilentlyContinue)
    $npm = (Get-Command npm  -ErrorAction SilentlyContinue)

    if ($hasPnpmLock -and $pnpm) { return "pnpm" }
    if ($hasYarnLock -and $yarn) { return "yarn" }
    if ($npm) { return "npm" }

    return "npm"
}

function Get-PackageScripts([string]$RepoRoot) {
    $pkg = Join-Path $RepoRoot "package.json"
    if (-not (Test-Path -LiteralPath $pkg)) { return @{} }
    try {
        $json = Get-Content -LiteralPath $pkg -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($json.scripts) {
            return $json.scripts.PSObject.Properties |
            ForEach-Object { @{ Name = $_.Name; Value = [string]$_.Value } } |
            ForEach-Object -Begin { $h = @{} } -Process { $h[$_.Name] = $_.Value } -End { $h }
        }
    }
    catch {}
    return @{}
}

function PM-Run([string]$pm, [string]$scriptName) {
    if ($pm -eq "pnpm") { & pnpm -s run $scriptName }
    elseif ($pm -eq "yarn") { & yarn -s run $scriptName }
    else { & npm run $scriptName }
}

function Invoke-PolicyStep {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$LogPath,
        [Parameter(Mandatory = $true)][scriptblock]$Command,
        [Parameter(Mandatory = $true)][ValidateSet("warn", "fail", "off")][string]$Policy,
        [string]$SkipNote = ""
    )

    if ($Policy -eq "off") {
        Write-TextFile $LogPath @("[SKIP] policy=off. $SkipNote")
        return New-StepResult -Name $Name -Status "SKIP" -ExitCode 0 -DurationMs 0 -LogPath $LogPath -Command "" -Note "policy=off"
    }

    if ($Policy -eq "fail") {
        return Invoke-Step -State $log -Name $Name -LogPath $LogPath -Quiet:$Quiet -Command $Command
    }

    # warn => tout exit != 0 devient WARN (jamais ERR)
    $warnExit = 1..255
    return Invoke-Step -State $log -Name $Name -WarnExitCodes $warnExit -LogPath $LogPath -Quiet:$Quiet -Command $Command
}

$pushed = $false
$runDir = $null

try {
    $audit = Resolve-AuditRun -RepoRoot $RepoRoot -OutDir $OutDir -RunStamp $RunStamp -Mode $Mode -Archive:$Archive -Prefix "VALID" -CleanLatest:(-not $NoCleanLatest)
    $RepoRoot = $audit.RepoRoot
    $OutDirAbs = $audit.OutDir
    $RunStamp = $audit.RunStamp
    $runDir = $audit.RunDir

    $mainLog = Join-Path $runDir "validate-full.log"
    Set-LogFile -Path $mainLog -Reset

    $resolvedAuditPolicy = Resolve-Policy3 -Requested $AuditPolicy -EnvVar "CI_AUDIT_POLICY" -Default "warn"
    $resolvedLintPolicy = Resolve-Policy3 -Requested $LintPolicy  -EnvVar "CI_LINT_POLICY"  -Default "warn"

    Info $log "Validation start"
    Info $log ("Repo root : {0}" -f $RepoRoot)
    Info $log ("Run stamp : {0}" -f $RunStamp)
    Info $log ("Run dir   : {0}" -f $runDir)
    Info $log ("Mode      : {0}" -f $audit.Mode)
    Info $log ("Archive   : {0}" -f ([bool]$audit.Archive))
    Info $log ("Strict    : {0}" -f ([bool]$Strict))
    Info $log ("DirtyPolicy(resolved): {0}" -f (Resolve-DirtyPolicy -Requested $DirtyPolicy -Branch (Try-GetGitBranch $RepoRoot)))
    Info $log ("LintPolicy(resolved): {0}" -f $resolvedLintPolicy)
    Info $log ("AuditPolicy(resolved): {0}" -f $resolvedAuditPolicy)

    $validateRoot = Join-Path $runDir "_validate"
    Ensure-Dir $validateRoot

    $dirs = [ordered]@{
        gate          = Join-Path $validateRoot "gate"
        lint          = Join-Path $validateRoot "lint"
        typecheck     = Join-Path $validateRoot "typecheck"
        tests         = Join-Path $validateRoot "tests"
        build         = Join-Path $validateRoot "build"
        runtime       = Join-Path $validateRoot "runtime"
        opacity       = Join-Path $validateRoot "opacity"
        opacity_sinks = Join-Path $validateRoot "opacity_sinks"
        e2e           = Join-Path $validateRoot "e2e"
    }
    foreach ($d in $dirs.Values) { Ensure-Dir $d }

    Push-Location $RepoRoot
    $pushed = $true

    $branch = Try-GetGitBranch $RepoRoot
    $resolvedDirtyPolicy = Resolve-DirtyPolicy -Requested $DirtyPolicy -Branch $branch

    $steps = @()

    # Dirty check
    $dirtyLog = Join-Path $dirs.gate "dirty-check.log"
    $dirty = $false
    $dirtyStatus = "SKIP"
    $dirtyNote = ""

    $gitCmd = Get-Command git -ErrorAction SilentlyContinue
    if (-not $gitCmd) {
        $dirtyStatus = "SKIP"
        $dirtyNote = "git not found; dirty check skipped"
        Write-TextFile $dirtyLog @("[SKIP] git not found; cannot check working tree state.")
    }
    else {
        $dirty = Test-GitDirty $RepoRoot
        if ($resolvedDirtyPolicy -eq "off") {
            $dirtyStatus = "OK"
            $dirtyNote = "dirty policy off"
            Write-TextFile $dirtyLog @("[OK] dirty policy off; ignoring working tree state.")
        }
        elseif (-not $dirty) {
            $dirtyStatus = "OK"
            $dirtyNote = "clean"
            Write-TextFile $dirtyLog @("[OK] working tree clean.")
        }
        else {
            if ($resolvedDirtyPolicy -eq "fail") {
                $dirtyStatus = "ERR"
                $dirtyNote = "dirty -> fail"
                Write-TextFile $dirtyLog @(
                    "[ERR] working tree is DIRTY and policy=fail.",
                    "",
                    ((git status --porcelain) | Out-String).TrimEnd()
                )
            }
            else {
                $dirtyStatus = "WARN"
                $dirtyNote = "dirty -> warn"
                Write-TextFile $dirtyLog @(
                    "[WARN] working tree is DIRTY and policy=warn.",
                    "",
                    ((git status --porcelain) | Out-String).TrimEnd()
                )
            }
        }
    }

    $steps += New-StepResult -Name "dirty-check" -Status $dirtyStatus -ExitCode ($(if ($dirtyStatus -eq "ERR") { 1 } else { 0 })) -DurationMs 0 -LogPath $dirtyLog -Command "git status --porcelain" -Note $dirtyNote

    $pm = Select-PackageManager $RepoRoot
    $scripts = Get-PackageScripts $RepoRoot

    # LINT (policy-driven)
    $lintLogPath = Join-Path $dirs.lint "lint.log"
    if ($scripts.ContainsKey("lint")) {
        $steps += Invoke-PolicyStep -Name "lint" -LogPath $lintLogPath -Policy $resolvedLintPolicy -Command {
            PM-Run $pm "lint"
        }
    }
    else {
        $eslintBin = Join-Path $RepoRoot "node_modules\.bin\eslint.cmd"
        $eslintBin2 = Join-Path $RepoRoot "node_modules\.bin\eslint"
        if ((Test-Path -LiteralPath $eslintBin) -or (Test-Path -LiteralPath $eslintBin2)) {
            $steps += Invoke-PolicyStep -Name "lint" -LogPath $lintLogPath -Policy $resolvedLintPolicy -Command {
                npx --no-install eslint .
            }
        }
        else {
            Write-TextFile $lintLogPath @("[SKIP] No lint script and eslint not detected.")
            $steps += New-StepResult -Name "lint" -Status "SKIP" -ExitCode 0 -DurationMs 0 -LogPath $lintLogPath -Command "" -Note "no lint configured"
            Warn $log "lint: SKIP (no script 'lint' and eslint not found)"
        }
    }

    # TYPECHECK
    $steps += Invoke-Step -State $log -Name "typecheck" -LogPath (Join-Path $dirs.typecheck "typecheck.log") -Quiet:$Quiet -Command {
        npx --no-install tsc -p tsconfig.json --noEmit
    }

    # TESTS
    $junitPath = Join-Path $dirs.tests "junit.xml"
    $steps += Invoke-Step -State $log -Name "tests" -LogPath (Join-Path $dirs.tests "tests.log") -Quiet:$Quiet -Command {
        npx --no-install vitest run --reporter default --reporter junit --outputFile $junitPath
    }

    # BUILD
    $steps += Invoke-Step -State $log -Name "build" -LogPath (Join-Path $dirs.build "build.log") -Quiet:$Quiet -Command {
        PM-Run $pm "build"
    }

    # Audits (policy-driven)
    $auditRuntime = Join-Path $ScriptDir "audit-runtime.ps1"
    $auditOpacity = Join-Path $ScriptDir "audit-opacity.ps1"
    $auditSinks = Join-Path $ScriptDir "audit-opacity-sinks.ps1"

    $steps += Invoke-PolicyStep -Name "audit-runtime" -LogPath (Join-Path $dirs.runtime "audit-runtime.step.log") -Policy $resolvedAuditPolicy -Command {
        pwsh -NoProfile -ExecutionPolicy Bypass -File $auditRuntime -RepoRoot $RepoRoot -OutDir "audit/_latest/runtime" -RunStamp $RunStamp -Quiet:$Quiet
    }

    $steps += Invoke-PolicyStep -Name "audit-opacity" -LogPath (Join-Path $dirs.opacity "audit-opacity.step.log") -Policy $resolvedAuditPolicy -Command {
        pwsh -NoProfile -ExecutionPolicy Bypass -File $auditOpacity -RepoRoot $RepoRoot -OutDir "audit/_latest/opacity" -RunStamp $RunStamp -Quiet:$Quiet
    }

    $steps += Invoke-PolicyStep -Name "audit-opacity-sinks" -LogPath (Join-Path $dirs.opacity_sinks "audit-opacity-sinks.step.log") -Policy $resolvedAuditPolicy -Command {
        pwsh -NoProfile -ExecutionPolicy Bypass -File $auditSinks -RepoRoot $RepoRoot -OutDir "audit/_latest/opacity_sinks" -RunStamp $RunStamp -Quiet:$Quiet
    }

    $coreIds = @("dirty-check", "lint", "typecheck", "tests", "build")
    $auditIds = @("audit-runtime", "audit-opacity", "audit-opacity-sinks")

    $coreSteps = @($steps | Where-Object { $coreIds -contains $_.Name })
    $auditSteps = @($steps | Where-Object { $auditIds -contains $_.Name })

    $gateOverall = Get-OverallStatus $coreSteps
    $auditOverall = Get-OverallStatus $auditSteps
    $overall = Get-OverallStatus $steps

    # gate-core.json
    $ciLatestDir = Join-Path $RepoRoot "audit\_latest\ci"
    Ensure-Dir $ciLatestDir
    $gateDir = Join-Path $dirs.gate "core"
    Ensure-Dir $gateDir

    $gateCorePathLatest = Join-Path $ciLatestDir "gate-core.json"
    $gateCorePathRun = Join-Path $gateDir "gate-core.json"

    $gateCore = [ordered]@{
        schemaVersion = 3
        timestamp     = (Get-Date).ToString("o")
        runStamp      = $RunStamp
        repoRoot      = $RepoRoot
        runDir        = $runDir
        mode          = $audit.Mode
        archive       = [bool]$audit.Archive
        strict        = [bool]$Strict
        policies      = [ordered]@{
            dirtyPolicy = $resolvedDirtyPolicy
            lintPolicy  = $resolvedLintPolicy
            auditPolicy = $resolvedAuditPolicy
        }
        git           = [ordered]@{
            branch  = $branch
            isDirty = [bool]$dirty
        }
        overall       = $overall
        gateOverall   = $gateOverall
        auditOverall  = $auditOverall
        steps         = $coreSteps
        audits        = $auditSteps
    }

    ($gateCore | ConvertTo-Json -Depth 10) | Set-Content -LiteralPath $gateCorePathLatest -Encoding UTF8
    ($gateCore | ConvertTo-Json -Depth 10) | Set-Content -LiteralPath $gateCorePathRun -Encoding UTF8
    Ok $log ("gate-core.json: {0}" -f $gateCorePathLatest)

    # Summary console
    foreach ($s in $steps) {
        $sec = [Math]::Round(($s.DurationMs / 1000), 2)
        $msg = ("{0,-22} {1,6}s exit={2}" -f $s.Name, $sec, $s.ExitCode)
        if ($s.Status -eq "OK") { Ok $log $msg }
        elseif ($s.Status -eq "SKIP") { Warn $log ("{0} (SKIP)" -f $msg) }
        elseif ($s.Status -eq "WARN") { Warn $log $msg }
        else { Err $log $msg }
    }

    if ($gateOverall -eq "OK") { Ok $log "RESULT OK (gate)" }
    elseif ($gateOverall -eq "WARN" -and $Strict) { Warn $log "RESULT WARN (gate, strict=on, exit=1)" }
    elseif ($gateOverall -eq "WARN") { Warn $log "RESULT WARN (gate)" }
    else { Err $log "RESULT ERR (gate)" }

    # summary files
    $summaryTxt = Join-Path $runDir "summary.txt"
    $summaryJson = Join-Path $runDir "summary.json"

    $summaryLines = New-Object System.Collections.Generic.List[string]
    $summaryLines.Add(("runStamp: {0}" -f $RunStamp)) | Out-Null
    $summaryLines.Add(("repoRoot: {0}" -f $RepoRoot)) | Out-Null
    $summaryLines.Add(("outDir  : {0}" -f $OutDirAbs)) | Out-Null
    $summaryLines.Add(("runDir  : {0}" -f $runDir)) | Out-Null
    $summaryLines.Add(("overall : {0}" -f $overall)) | Out-Null
    $summaryLines.Add(("gateOverall : {0}" -f $gateOverall)) | Out-Null
    $summaryLines.Add(("auditOverall: {0}" -f $auditOverall)) | Out-Null
    foreach ($s in $steps) {
        $sec = [Math]::Round(($s.DurationMs / 1000), 2)
        $summaryLines.Add(("{0} {1} {2}s exit={3} log={4}" -f $s.Status, $s.Name, $sec, $s.ExitCode, $s.LogPath)) | Out-Null
    }
    Set-Content -LiteralPath $summaryTxt -Value ($summaryLines -join "`r`n") -Encoding UTF8

    $payload = [ordered]@{
        timestamp    = (Get-Date).ToString("o")
        runStamp     = $RunStamp
        repoRoot     = $RepoRoot
        outDir       = $OutDirAbs
        runDir       = $runDir
        mode         = $audit.Mode
        archive      = [bool]$audit.Archive
        strict       = [bool]$Strict
        dirtyPolicy  = $resolvedDirtyPolicy
        lintPolicy   = $resolvedLintPolicy
        auditPolicy  = $resolvedAuditPolicy
        overall      = $overall
        gateOverall  = $gateOverall
        auditOverall = $auditOverall
        warnCount    = $log.WarnCount
        errCount     = $log.ErrCount
        steps        = $steps
        logs         = $mainLog
        gateCore     = $gateCorePathLatest
    }
    ($payload | ConvertTo-Json -Depth 10) | Set-Content -LiteralPath $summaryJson -Encoding UTF8

    # ✅ Contract clean: timestamp string ISO-8601 (évite DateTime dans les consommateurs)
    Write-AuditManifest -Path $audit.Manifest -Payload @{
        timestamp    = (Get-Date).ToString("o")
        runStamp     = $RunStamp
        repoRoot     = $RepoRoot
        outDir       = $OutDirAbs
        runDir       = $runDir
        mode         = $audit.Mode
        archive      = [bool]$audit.Archive
        git          = $audit.Git
        steps        = $steps
        overall      = $overall
        gateOverall  = $gateOverall
        auditOverall = $auditOverall
        warnCount    = $log.WarnCount
        errCount     = $log.ErrCount
    }

    # ✅ latest.txt sans newline => lecture fiable en -Raw
    $latestPath = Join-Path $audit.BaseDir "latest.txt"
    Set-Content -LiteralPath $latestPath -Value $runDir -Encoding UTF8 -NoNewline
    Ok $log ("latest : {0}" -f $runDir)

    # Exit policy basé sur gateOverall
    if ($gateOverall -eq "OK") { exit 0 }
    if ($gateOverall -eq "WARN" -and -not $Strict) { exit 0 }
    exit 1
}
catch {
    Err $log $_.Exception.Message
    if ($runDir) {
        try { Write-LogFile -State $log -Path (Join-Path $runDir "validate-full.error.log") } catch {}
    }
    exit 1
}
finally {
    if ($pushed) { Pop-Location }
}
