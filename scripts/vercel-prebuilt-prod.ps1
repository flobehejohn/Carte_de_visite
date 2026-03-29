[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$RepoRoot = "",
    [string]$LocalConfig = "",
    [string]$AuditLogPath = "",
    [string]$Stamp = "",
    [switch]$Yes,
    [switch]$PostDeploySmoke,
    [switch]$AutoDiag,
    [switch]$EnableSpawnTrace,
    [int]$SmokeTimeoutSec = 60
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$script:AuditLogPath = ""
$script:AuditStamp = ""

function Write-Log([string]$Message) {
    Write-Host $Message
    if (-not [string]::IsNullOrWhiteSpace($script:AuditLogPath)) {
        Add-Content -Path $script:AuditLogPath -Value $Message
    }
}

function Write-LogLines([string[]]$Lines) {
    if ($null -eq $Lines) { return }
    foreach ($line in $Lines) { Write-Log $line }
}

function Initialize-Audit([string]$RepoRoot, [string]$AuditLogPath, [string]$Stamp) {
    $auditDir = Join-Path $RepoRoot "audit/_latest"
    New-Item -ItemType Directory -Force -Path $auditDir | Out-Null
    if ([string]::IsNullOrWhiteSpace($Stamp)) { $Stamp = (Get-Date -Format "yyyyMMdd_HHmmss") }
    if ([string]::IsNullOrWhiteSpace($AuditLogPath)) {
        $AuditLogPath = Join-Path $auditDir ("vercel_prebuilt_prod_{0}.log" -f $Stamp)
    }
    $script:AuditLogPath = $AuditLogPath
    $script:AuditStamp = $Stamp
    New-Item -ItemType File -Force -Path $script:AuditLogPath | Out-Null
}

function Ensure-Repo([string]$p) {
    if ([string]::IsNullOrWhiteSpace($p)) { $p = (Get-Location).Path }
    if (-not (Test-Path -LiteralPath $p)) { throw "RepoRoot not found: $p" }
    if (-not (Test-Path -LiteralPath (Join-Path $p "package.json"))) {
        throw "package.json not found in: $p (not repo root)"
    }
    return (Resolve-Path $p).Path
}

function Ensure-WindowsCmd {
    if (-not $IsWindows) { return }

    if (-not $env:SystemRoot) {
        throw "[vercel-prebuilt] SystemRoot is empty. Cannot locate cmd.exe."
    }

    $system32 = Join-Path $env:SystemRoot "System32"
    $cmdPath = Join-Path $system32 "cmd.exe"

    if (-not (Test-Path -LiteralPath $cmdPath)) {
        throw "[vercel-prebuilt] cmd.exe not found: $cmdPath"
    }

    $env:ComSpec = $cmdPath
    if ($env:Path -notmatch [regex]::Escape($system32)) {
        $env:Path = "$system32;$env:Path"
    }

    Write-Log "[vercel-prebuilt][DBG] SystemRoot=$env:SystemRoot"
    Write-Log "[vercel-prebuilt][DBG] ComSpec=$env:ComSpec"
    Write-Log "[vercel-prebuilt][DBG] Path contains System32=$($env:Path -match [regex]::Escape($system32))"

    & $env:ComSpec /c "where cmd && echo CMD_OK" | ForEach-Object { Write-Log "[vercel-prebuilt][DBG] $_" }

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw "[vercel-prebuilt] node not found in PATH."
    }

    $nodeScript = @"
const { spawnSync } = require('child_process');
const r = spawnSync('cmd.exe', ['/c', 'echo NODE_SPAWN_CMD_OK'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
"@
    $global:LASTEXITCODE = 0
    & node -e $nodeScript
    if ($LASTEXITCODE -ne 0) {
        throw "[vercel-prebuilt] Node failed to spawn cmd.exe (exit=$LASTEXITCODE)."
    }
}

function Log-VercelEnvOverrides([string]$RepoRoot) {
    $envFile = Join-Path $RepoRoot ".vercel\.env.production.local"
    if (-not (Test-Path -LiteralPath $envFile)) {
        Write-Log "[vercel-prebuilt][ENV] .vercel\\.env.production.local not found"
        return
    }

    $keys = Get-Content $envFile | ForEach-Object {
        if ($_ -match '^(PATH|Path|ComSpec|COMSPEC|SystemRoot|windir)\s*=') { $matches[1] }
    } | Sort-Object -Unique

    if ($null -eq $keys -or $keys.Count -eq 0) {
        Write-Log "[vercel-prebuilt][ENV] no PATH/ComSpec/SystemRoot/windir overrides detected"
        return
    }

    Write-Log ("[vercel-prebuilt][ENV] overrides detected: " + ($keys -join ", "))
}

function Write-EnvSnapshot {
    Write-Log "[vercel-prebuilt][ENV] snapshot (metadata only)"
    $keys = @("ComSpec","COMSPEC","SystemRoot","windir","Path","PATH","PATHEXT","npm_config_prefix","NODE_OPTIONS","npm_execpath")
    foreach ($k in $keys) {
        $v = [System.Environment]::GetEnvironmentVariable($k)
        $present = $false
        $len = 0
        if ($null -ne $v) { $present = $true; $len = $v.Length }
        Write-Log ("[vercel-prebuilt][ENV] {0} present={1} length={2}" -f $k, $present, $len)
        if ($k -in @("Path","PATH")) {
            $low = if ($v) { $v.ToLowerInvariant() } else { "" }
            $hasSystem32 = $low.Contains("\\system32")
            $hasWinSystem32 = $low.Contains("\\windows\\system32")
            Write-Log ("[vercel-prebuilt][ENV] {0} has_system32={1} has_windows_system32={2}" -f $k, $hasSystem32, $hasWinSystem32)
        }
    }
}

function Get-VercelEntry {
    try {
        $binJson = & node -p "JSON.stringify(require('vercel/package.json').bin)" 2>$null
        if ($binJson) {
            $bin = $binJson | ConvertFrom-Json
            if ($bin.vercel) {
                $p = Resolve-Path -LiteralPath $bin.vercel -ErrorAction SilentlyContinue
                if ($p) { return $p.Path }
            }
        }
    }
    catch { }
    return ""
}

function Invoke-NodeVercel {
    param(
        [Parameter(Mandatory = $true)][string[]]$Args,
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [switch]$EnableSpawnTrace
    )
    $entry = Get-VercelEntry
    if ([string]::IsNullOrWhiteSpace($entry)) {
        Write-Log "[vercel-prebuilt][WARN] vercel CLI entry not found (node fallback skipped)"
        $global:LASTEXITCODE = 1
        return @()
    }

    $hookPath = Join-Path $RepoRoot "scripts\\diag\\hook-spawn.cjs"
    $traceLog = Join-Path $RepoRoot ("audit\\_latest\\vercel_spawn_trace_{0}.log" -f $script:AuditStamp)
    $oldNodeOptions = $env:NODE_OPTIONS

    if ($EnableSpawnTrace) {
        if (-not (Test-Path -LiteralPath $hookPath)) {
            Write-Log "[vercel-prebuilt][WARN] hook-spawn.cjs not found (spawn trace skipped)"
        }
        else {
            $hookPathForNode = $hookPath.Replace("\", "/")
            $traceOpt = "--require $hookPathForNode --trace-warnings --trace-uncaught"
            $env:NODE_OPTIONS = ($oldNodeOptions ? ($oldNodeOptions + " " + $traceOpt) : $traceOpt)
            $env:CODEX_SPAWN_TRACE_LOG = $traceLog
            Write-Log ("[vercel-prebuilt] spawnTraceLog={0}" -f $traceLog)
        }
    }

    try {
        Write-Log ("[vercel-prebuilt][CMD] node {0} {1}" -f $entry, ($Args -join " "))
        $output = @(& node $entry @Args 2>&1)
        $exit = $LASTEXITCODE
        Write-LogLines $output
        $global:LASTEXITCODE = $exit
        return $output
    }
    finally {
        if ($EnableSpawnTrace) {
            if ($oldNodeOptions) { $env:NODE_OPTIONS = $oldNodeOptions } else { Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue }
            Remove-Item Env:CODEX_SPAWN_TRACE_LOG -ErrorAction SilentlyContinue
        }
    }
}

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Action
    )
    Write-Log "[vercel-prebuilt] ==> $Name"
    $global:LASTEXITCODE = 0
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "[vercel-prebuilt] Step '$Name' FAILED (exit=$LASTEXITCODE)"
    }
    Write-Log "[vercel-prebuilt] <== $Name OK"
}

# Use vercel if available, else npx vercel
$script:UseNpx = $false
if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
    if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
        throw "[vercel-prebuilt] Neither 'vercel' nor 'npx' found in PATH."
    }
    $script:UseNpx = $true
}

function Invoke-Vercel {
    param(
        [Parameter(Mandatory = $true)][string[]]$VercelArgs
    )

    $cmdLine = ($script:UseNpx ? "npx vercel" : "vercel") + " " + ($VercelArgs -join " ")
    Write-Log "[vercel-prebuilt][CMD] $cmdLine"

    $output = @()
    if ($script:UseNpx) {
        if ($Yes) { $output = @(& npx --yes vercel @VercelArgs 2>&1) }
        else { $output = @(& npx vercel @VercelArgs 2>&1) }
    }
    else {
        $output = @(& vercel @VercelArgs 2>&1)
    }
    $exit = $LASTEXITCODE
    Write-LogLines $output
    $global:LASTEXITCODE = $exit
}

function Invoke-VercelCapture {
    param([Parameter(Mandatory = $true)][string[]]$VercelArgs)

    $cmdLine = ($script:UseNpx ? "npx vercel" : "vercel") + " " + ($VercelArgs -join " ")
    Write-Log "[vercel-prebuilt][CMD] $cmdLine"

    $output = @()
    if ($script:UseNpx) {
        if ($Yes) { $output = @(& npx --yes vercel @VercelArgs 2>&1) }
        else { $output = @(& npx vercel @VercelArgs 2>&1) }
    }
    else {
        $output = @(& vercel @VercelArgs 2>&1)
    }
    $exit = $LASTEXITCODE
    Write-LogLines $output
    $global:LASTEXITCODE = $exit
    return $output
}

function Invoke-VercelNpxCapture {
    param([Parameter(Mandatory = $true)][string[]]$VercelArgs)

    if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
        Write-Log "[vercel-prebuilt][WARN] npx not found (npx fallback skipped)"
        $global:LASTEXITCODE = 1
        return @()
    }

    $cmdLine = "npx vercel " + ($VercelArgs -join " ")
    Write-Log "[vercel-prebuilt][CMD] $cmdLine"

    $output = @()
    if ($Yes) { $output = @(& npx --yes vercel @VercelArgs 2>&1) }
    else { $output = @(& npx vercel @VercelArgs 2>&1) }
    $exit = $LASTEXITCODE
    Write-LogLines $output
    $global:LASTEXITCODE = $exit
    return $output
}

function Extract-DeployUrl([string[]]$Lines) {
    if ($null -eq $Lines) { return "" }
    $matches = $Lines | Select-String -Pattern 'https?://[^\s]+' -AllMatches |
        ForEach-Object { $_.Matches } | ForEach-Object { $_.Value }
    $matches = @($matches | ForEach-Object { $_.Trim() })
    $vercel = @($matches | Where-Object { $_ -match 'vercel\.app' })
    if ($vercel.Count -gt 0) { return $vercel[-1] }
    if ($matches.Count -gt 0) { return $matches[-1] }
    return ""
}

$RepoRoot = Ensure-Repo $RepoRoot
Initialize-Audit -RepoRoot $RepoRoot -AuditLogPath $AuditLogPath -Stamp $Stamp
Write-Log "[vercel-prebuilt] RepoRoot: $RepoRoot"
Write-Log "[vercel-prebuilt] AuditLog: $script:AuditLogPath"
Write-Log "[vercel-prebuilt][DBG] invoker=$($script:UseNpx ? 'npx vercel' : 'vercel')"

Ensure-WindowsCmd
Log-VercelEnvOverrides -RepoRoot $RepoRoot

$localConfigArgs = @()
if (-not [string]::IsNullOrWhiteSpace($LocalConfig)) {
    $localConfigArgs = @("--local-config", $LocalConfig)
}

# stop processes that lock (rollup/esbuild)
Get-Process node, vite, vercel -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

Push-Location $RepoRoot
try {
    $vercelYes = @()
    if ($Yes) { $vercelYes = @("--yes") }

    # reset deps
    $reset = Join-Path $RepoRoot "scripts\reset-deps.ps1"
    Invoke-Step -Name "reset-deps" -Action {
        $out = & pwsh -NoProfile -ExecutionPolicy Bypass -File $reset -RepoRoot $RepoRoot 2>&1
        $exit = $LASTEXITCODE
        Write-LogLines @($out)
        $global:LASTEXITCODE = $exit
    }

    # versions
    Invoke-Step -Name "node-version"  -Action {
        $out = & node --version 2>&1
        $exit = $LASTEXITCODE
        Write-LogLines @($out)
        $global:LASTEXITCODE = $exit
    }
    Invoke-Step -Name "npm-version"   -Action {
        $out = & npm --version 2>&1
        $exit = $LASTEXITCODE
        Write-LogLines @($out)
        $global:LASTEXITCODE = $exit
    }
    Invoke-Step -Name "vercel-version" -Action { Invoke-Vercel @("--version") }

    if ($AutoDiag) {
        Write-EnvSnapshot
    }
    Write-Log "[vercel-prebuilt][WARN] vercel pull skipped (no .vercel/*.local writes)"

    # build prebuilt prod (LOCAL)
    Invoke-Step -Name "vercel-build-prod" -Action {
        $vArgs = @("build", "--prod") + $vercelYes + $localConfigArgs
        if ($AutoDiag) {
            $lines = Invoke-VercelCapture $vArgs
            $exit = $LASTEXITCODE

            if ($exit -ne 0) {
                $joined = ($lines -join "`n")
                $cmdEnoent = $joined -match '(?i)spawn cmd\.exe ENOENT'
                if ($cmdEnoent) {
                    Write-Log "[vercel-prebuilt][AUTO] detected spawn cmd.exe ENOENT"
                    if (-not $script:UseNpx) {
                        Write-Log "[vercel-prebuilt][AUTO] retry build via npx vercel"
                        $lines = Invoke-VercelNpxCapture $vArgs
                        $exit = $LASTEXITCODE
                    }
                    if ($exit -ne 0 -and $EnableSpawnTrace) {
                        Write-Log "[vercel-prebuilt][AUTO] retry build via node entry with spawn trace"
                        $lines = Invoke-NodeVercel -Args $vArgs -RepoRoot $RepoRoot -EnableSpawnTrace
                        $exit = $LASTEXITCODE
                    }
                    elseif ($exit -ne 0 -and -not $EnableSpawnTrace) {
                        Write-Log "[vercel-prebuilt][AUTO] spawn trace disabled (EnableSpawnTrace=false)"
                    }
                }
                else {
                    Write-Log "[vercel-prebuilt][AUTO] build failed (not cmd.exe ENOENT)"
                }
            }
            $global:LASTEXITCODE = $exit
        }
        else {
            Invoke-Vercel $vArgs
        }
    }

    # deploy prebuilt prod
    $script:LastDeployLines = @()
    Invoke-Step -Name "vercel-deploy-prebuilt-prod" -Action {
        $vArgs = @("deploy", "--prebuilt", "--prod") + $vercelYes + $localConfigArgs
        $script:LastDeployLines = Invoke-VercelCapture $vArgs
    }

    $deployUrl = Extract-DeployUrl $script:LastDeployLines
    if ($PostDeploySmoke) {
        if ([string]::IsNullOrWhiteSpace($deployUrl)) {
            Write-Log "[vercel-prebuilt][WARN] deploy URL not found => smoke skipped"
        }
        else {
            $smokeApi = Join-Path $RepoRoot "scripts\smoke-api.ps1"
            Write-Log "[vercel-prebuilt] post-deploy smoke-api => $deployUrl"
            & pwsh -NoProfile -ExecutionPolicy Bypass -File $smokeApi -BaseUrl $deployUrl -TimeoutSec $SmokeTimeoutSec -RequireCitations
        }
    }

    Write-Log "[vercel-prebuilt] OK"
}
finally {
    Pop-Location
}
