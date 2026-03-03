param(
    [string]$RepoRoot = "",
    [string]$RunStamp = "",
    [string]$OutDir = "audit/fiesta",

    [ValidateSet("local", "ci")]
    [string]$Mode = "local",

    [ValidateSet("fail", "warn", "ignore")]
    [string]$DirtyPolicy = "warn",

    [ValidateSet("fail", "warn", "ignore")]
    [string]$LintPolicy = "warn",

    [ValidateSet("fail", "warn", "ignore")]
    [string]$TestPolicy = "warn",

    [ValidateSet("fail", "warn", "ignore")]
    [string]$BuildPolicy = "warn",

    [ValidateSet("fail", "warn", "ignore")]
    [string]$AuditPolicy = "warn",

    [int]$InstallTimeoutSec = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Import-Module (Join-Path $ScriptDir "_lib\Log.psm1") -Force
Import-Module (Join-Path $ScriptDir "_lib\Json.psm1") -Force
Import-Module (Join-Path $ScriptDir "_lib\Process.psm1") -Force
Import-Module (Join-Path $ScriptDir "_lib\Git.psm1") -Force
# supprime le WARNING "unapproved verbs" sans impacter l’exécution
Import-Module (Join-Path $ScriptDir "_lib\Node.psm1") -Force -DisableNameChecking

function Normalize-Policy([string]$p) {
    if ([string]::IsNullOrWhiteSpace($p)) { return "warn" }
    $v = $p.ToLowerInvariant()
    if ($v -in @("fail", "warn", "ignore")) { return $v }
    return "warn"
}

function Ensure-Dir([string]$p) {
    if (-not (Test-Path -LiteralPath $p)) {
        New-Item -ItemType Directory -Path $p -Force | Out-Null
    }
}

function Write-StepLog([string]$Path, [hashtable]$proc) {
    $lines = @()
    $lines += "cmd: $($proc.Command)"
    $lines += "runner: $($proc.Runner)"
    $lines += "resolved: $($proc.Resolved)"
    $lines += "exit: $($proc.ExitCode)"
    $lines += "durationMs: $($proc.DurationMs)"
    if ($proc.ContainsKey("TimedOut")) { $lines += "timedOut: $($proc.TimedOut)" }
    $lines += "stdout:"
    $lines += ($proc.Stdout ?? "")
    $lines += "stderr:"
    $lines += ($proc.Stderr ?? "")
    Set-Content -LiteralPath $Path -Value ($lines -join "`r`n") -Encoding UTF8
}

function Get-RepoRoot([string]$hint) {
    if (-not [string]::IsNullOrWhiteSpace($hint)) {
        return (Resolve-Path -LiteralPath $hint).Path
    }
    try {
        $root = (git rev-parse --show-toplevel) 2>$null
        if ($root) { return $root.Trim() }
    } catch {}
    return (Get-Location).Path
}

function Policy-Status([string]$policy, [int]$exitCode) {
    if ($exitCode -eq 0) { return "OK" }
    if ($policy -eq "ignore") { return "OK" }
    if ($policy -eq "warn") { return "WARN" }
    return "FAIL"
}

function Level-ForStatus([string]$status) {
    if ($status -eq "OK") { return "OK" }
    if ($status -eq "WARN") { return "WARN" }
    return "ERR"
}

$steps = @()
$errors = @()

function Add-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][ValidateSet("OK", "WARN", "FAIL")] [string]$Status,
        [Parameter(Mandatory = $true)][int]$ExitCode,
        [Parameter(Mandatory = $true)][int]$DurationMs,
        [string]$LogFile = ""
    )
    $script:steps += [ordered]@{
        Name       = $Name
        Status     = $Status
        ExitCode   = $ExitCode
        DurationMs = $DurationMs
        LogFile    = $LogFile
    }
}

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][ValidateSet("fail", "warn", "ignore")] [string]$Policy,
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$LogFile,
        [int]$TimeoutSec = 0,
        [hashtable]$Env = @{}
    )

    $proc = Invoke-Proc -FilePath $FilePath -Arguments $Arguments -WorkingDirectory $script:RepoRoot -TimeoutSec $TimeoutSec -Env $Env
    Write-StepLog -Path $LogFile -proc $proc

    $status = Policy-Status $Policy $proc.ExitCode
    Add-Step -Name $Name -Status $status -ExitCode $proc.ExitCode -DurationMs $proc.DurationMs -LogFile $LogFile
    Write-Log (Level-ForStatus $status) ("{0} exit={1}" -f $Name, $proc.ExitCode)

    if ($proc.ExitCode -ne 0 -and $Policy -eq "fail") {
        throw "Step '$Name' failed with exit=$($proc.ExitCode). See: $LogFile"
    }

    return $proc
}

$script:RepoRoot = Get-RepoRoot $RepoRoot
if ([string]::IsNullOrWhiteSpace($RunStamp)) { $RunStamp = (Get-Date).ToString("yyyyMMdd_HHmmss") }

$DirtyPolicy = Normalize-Policy $DirtyPolicy
$LintPolicy  = Normalize-Policy $LintPolicy
$TestPolicy  = Normalize-Policy $TestPolicy
$BuildPolicy = Normalize-Policy $BuildPolicy
$AuditPolicy = Normalize-Policy $AuditPolicy

$runDir = Join-Path $script:RepoRoot (Join-Path $OutDir $RunStamp)
Ensure-Dir $runDir
$stepsDir = Join-Path $runDir "steps"
Ensure-Dir $stepsDir

$stepsLog = Join-Path $runDir "steps.log"
Set-LogPath $stepsLog

Write-Log "INFO" ("fiesta-audit start mode={0} run={1}" -f $Mode, $RunStamp)
Write-Log "INFO" ("repoRoot={0}" -f $script:RepoRoot)

try {
    $toolLog = Join-Path $stepsDir "toolchain-npm.log"
    $toolProc = Invoke-Step -Name "toolchain-npm" -Policy "fail" -FilePath "npm" -Arguments @("--version") -LogFile $toolLog -TimeoutSec 30

    try {
        $envInfo = Get-NodeInfo
    } catch {
        $envInfo = [ordered]@{ warning = "Get-NodeInfo failed"; error = ($_ | Out-String) }
    }
    $pathParts = if ($env:PATH) { $env:PATH.Split([IO.Path]::PathSeparator) } else { @() }
    $envInfo.path = [ordered]@{ count = $pathParts.Count; head = $pathParts | Select-Object -First 5 }
    Write-JsonAtomic -Path (Join-Path $runDir "env.json") -Object $envInfo

    $git = Get-GitInfo -RepoRoot $script:RepoRoot
    Write-JsonAtomic -Path (Join-Path $runDir "git.json") -Object $git

    $dirty = $false
    if ($git.statusShort) {
        $lines = ($git.statusShort -split "`r?`n")
        if ($lines.Count -gt 1) { $dirty = $true }
    }
    $dirtyExit = if ($dirty) { 1 } else { 0 }
    $dirtyStatus = if ($dirty) { Policy-Status $DirtyPolicy 1 } else { "OK" }
    Add-Step -Name "git-dirty" -Status $dirtyStatus -ExitCode $dirtyExit -DurationMs 0 -LogFile ""
    Write-Log (Level-ForStatus $dirtyStatus) ("git-dirty status={0}" -f $dirtyStatus)

    $pkgPath = Join-Path $script:RepoRoot "package.json"
    $pkg = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json

    $npmInfo = [ordered]@{
        scripts   = $pkg.scripts
        lockHash  = Hash-Lockfile -RepoRoot $script:RepoRoot
        toolchain = [ordered]@{
            npmCommand  = $toolProc.Command
            npmResolved = $toolProc.Resolved
            npmVersion  = ($toolProc.Stdout.Trim())
        }
    }

    $nm = Join-Path $script:RepoRoot "node_modules"
    $hasNm = Test-Path -LiteralPath $nm
    $needInstall = ($Mode -eq "ci") -or (-not $hasNm)

    if ($needInstall) {
        $logFile = Join-Path $stepsDir "npm-ci.log"
        Invoke-Step -Name "npm-ci" -Policy $AuditPolicy -FilePath "npm" -Arguments @("ci", "--no-audit", "--no-fund") -LogFile $logFile -TimeoutSec $InstallTimeoutSec | Out-Null
    }
    else {
        Add-Step -Name "npm-ci" -Status "OK" -ExitCode 0 -DurationMs 0 -LogFile ""
        Write-Log "OK" "npm-ci skipped (node_modules already present)"
    }

    $hasNmAfter = Test-Path -LiteralPath $nm
    $nmExit = if ($hasNmAfter) { 0 } else { 1 }
    $nmStatus = if ($hasNmAfter) { "OK" } else { Policy-Status $AuditPolicy 1 }
    Add-Step -Name "node_modules" -Status $nmStatus -ExitCode $nmExit -DurationMs 0 -LogFile ""
    Write-Log (Level-ForStatus $nmStatus) ("node_modules present={0}" -f [bool]$hasNmAfter)

    $npmLsLog = Join-Path $stepsDir "npm-ls.log"
    $npmLs = Invoke-Step -Name "npm-ls" -Policy "warn" -FilePath "npm" -Arguments @("ls", "--depth=0") -LogFile $npmLsLog -TimeoutSec 0
    $npmInfo.npmLsExit   = $npmLs.ExitCode
    $npmInfo.npmLsStdout = $npmLs.Stdout
    $npmInfo.npmLsStderr = $npmLs.Stderr
    Write-JsonAtomic -Path (Join-Path $runDir "npm.json") -Object $npmInfo

    if ($pkg.scripts -and ($pkg.scripts.PSObject.Properties.Name -contains "lint")) {
        $logFile = Join-Path $stepsDir "lint.log"
        Invoke-Step -Name "lint" -Policy $LintPolicy -FilePath "npm" -Arguments @("run", "-s", "lint") -LogFile $logFile | Out-Null
    }
    else {
        $st = Policy-Status $LintPolicy 1

        # IMPORTANT: pas de "(if (...) {...} else {...})" inline -> erreur "if not recognized"
        $exitForStep = if ($st -eq "OK") { 0 } else { 1 }

        Add-Step -Name "lint" -Status $st -ExitCode $exitForStep -DurationMs 0 -LogFile ""
        Write-Log (Level-ForStatus $st) "lint script not found"
    }

    $testScript = if ($pkg.scripts -and ($pkg.scripts.PSObject.Properties.Name -contains "test:ci")) { "test:ci" } else { "test" }
    $testLog = Join-Path $stepsDir "test.log"
    if ($testScript -eq "test:ci") {
        Invoke-Step -Name "test" -Policy $TestPolicy -FilePath "npm" -Arguments @("run", "-s", "test:ci") -LogFile $testLog | Out-Null
    }
    else {
        Invoke-Step -Name "test" -Policy $TestPolicy -FilePath "npm" -Arguments @("test") -LogFile $testLog | Out-Null
    }

    $buildLog = Join-Path $stepsDir "build.log"
    Invoke-Step -Name "build" -Policy $BuildPolicy -FilePath "npm" -Arguments @("run", "-s", "build") -LogFile $buildLog | Out-Null
}
catch {
    $msg = $_.Exception.Message
    $pos = ""
    try { $pos = $_.InvocationInfo.PositionMessage } catch {}
    $stack = ""
    try { $stack = $_.ScriptStackTrace } catch {}

    $errors += ("MESSAGE: " + $msg)
    if ($pos) { $errors += ("POSITION: " + $pos) }
    if ($stack) { $errors += ("STACK: " + $stack) }

    Write-Log "ERR" $msg
}

$overall = "OK"
if ($steps | Where-Object { $_.Status -eq "FAIL" }) { $overall = "FAIL" }
elseif ($steps | Where-Object { $_.Status -eq "WARN" }) { $overall = "WARN" }

$summary = [ordered]@{
    runStamp = $RunStamp
    repoRoot = $script:RepoRoot
    mode     = $Mode
    policies = @{
        dirty = $DirtyPolicy
        lint  = $LintPolicy
        test  = $TestPolicy
        build = $BuildPolicy
        audit = $AuditPolicy
    }
    overall  = $overall
    steps    = $steps
    errors   = $errors
}

Write-JsonAtomic -Path (Join-Path $runDir "summary.json") -Object $summary

if ($overall -eq "OK")   { Write-Log "OK"   "RESULT OK"   ; exit 0 }
if ($overall -eq "WARN") { Write-Log "WARN" "RESULT WARN" ; exit 0 }
Write-Log "ERR" "RESULT FAIL"
exit 1
