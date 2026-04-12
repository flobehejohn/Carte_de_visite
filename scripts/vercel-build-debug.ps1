[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$RepoRoot = "",
    [string]$LocalConfig = "",
    [string]$AuditLogPath = "",
    [string]$Stamp = "",
    [switch]$EnableSpawnTrace,
    [switch]$NoEnvFile,
    [switch]$Yes
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Ensure-Repo([string]$p) {
    if ([string]::IsNullOrWhiteSpace($p)) { $p = (Get-Location).Path }
    if (-not (Test-Path -LiteralPath $p)) { throw "RepoRoot not found: $p" }
    if (-not (Test-Path -LiteralPath (Join-Path $p "package.json"))) {
        throw "package.json not found in: $p (not repo root)"
    }
    return (Resolve-Path $p).Path
}

function Ensure-Audit([string]$RepoRoot, [string]$AuditLogPath, [string]$Stamp) {
    $auditDir = Join-Path $RepoRoot "audit/_latest"
    New-Item -ItemType Directory -Force -Path $auditDir | Out-Null
    if ([string]::IsNullOrWhiteSpace($Stamp)) { $Stamp = (Get-Date -Format "yyyyMMdd_HHmmss") }
    if ([string]::IsNullOrWhiteSpace($AuditLogPath)) {
        $AuditLogPath = Join-Path $auditDir ("vercel_build_debug_{0}.log" -f $Stamp)
    }
    New-Item -ItemType File -Force -Path $AuditLogPath | Out-Null
    return @{ LogPath = $AuditLogPath; Stamp = $Stamp }
}

function Get-VercelCmd {
    if (Get-Command vercel -ErrorAction SilentlyContinue) { return @{ Cmd = "vercel"; UseNpx = $false } }
    if (Get-Command npx -ErrorAction SilentlyContinue) { return @{ Cmd = "npx"; UseNpx = $true } }
    throw "Neither 'vercel' nor 'npx' found in PATH."
}

$RepoRoot = Ensure-Repo $RepoRoot
$audit = Ensure-Audit -RepoRoot $RepoRoot -AuditLogPath $AuditLogPath -Stamp $Stamp
$log = $audit.LogPath
$stamp = $audit.Stamp

$envFile = Join-Path $RepoRoot ".vercel\.env.production.local"
$bakFile = ""
$renamed = $false
$hookPath = Join-Path $RepoRoot "scripts\\diag\\hook-spawn.cjs"
$spawnTrace = Join-Path $RepoRoot ("audit\\_latest\\vercel_spawn_trace_{0}.log" -f $stamp)
$oldNodeOptions = $env:NODE_OPTIONS

Add-Content -Path $log -Value ("[vercel-build-debug] start stamp={0}" -f $stamp)
Add-Content -Path $log -Value ("[vercel-build-debug] repo={0}" -f $RepoRoot)
Add-Content -Path $log -Value ("[vercel-build-debug] envFile={0}" -f $envFile)
Add-Content -Path $log -Value ("[vercel-build-debug] enableSpawnTrace={0}" -f $EnableSpawnTrace)
Add-Content -Path $log -Value ("[vercel-build-debug] noEnvFile={0}" -f $NoEnvFile)

if ($NoEnvFile) {
    if (Test-Path -LiteralPath $envFile) {
        $bakFile = "$envFile.bak_$stamp"
        Move-Item -LiteralPath $envFile -Destination $bakFile -Force
        $renamed = $true
        Add-Content -Path $log -Value ("[vercel-build-debug] env renamed => {0}" -f $bakFile)
    }
    else {
        Add-Content -Path $log -Value "[vercel-build-debug] env file not found, no rename"
    }
}
else {
    Add-Content -Path $log -Value "[vercel-build-debug] no env rename (NoEnvFile=false)"
}

Push-Location $RepoRoot
try {
    if ($EnableSpawnTrace) {
        if (-not (Test-Path -LiteralPath $hookPath)) {
            throw "hook-spawn.cjs not found: $hookPath"
        }
        $hookPathForNode = $hookPath.Replace("\", "/")
        $traceOpt = "--require $hookPathForNode --trace-warnings --trace-uncaught"
        $env:NODE_OPTIONS = ($oldNodeOptions ? ($oldNodeOptions + " " + $traceOpt) : $traceOpt)
        $env:CODEX_SPAWN_TRACE_LOG = $spawnTrace
        $env:CODEX_SPAWN_ENVFIX = "1"
        Add-Content -Path $log -Value ("[vercel-build-debug] spawnTraceLog={0}" -f $spawnTrace)
    }

    $vercel = Get-VercelCmd
    $yesArgs = @()
    if ($Yes) { $yesArgs = @("--yes") }
    $localConfigArgs = @()
    if (-not [string]::IsNullOrWhiteSpace($LocalConfig)) {
        $localConfigArgs = @("--local-config", $LocalConfig)
        Add-Content -Path $log -Value ("[vercel-build-debug] local-config={0}" -f $LocalConfig)
    }

    $args = @("build", "--prod", "--debug") + $yesArgs + $localConfigArgs
    if (-not $vercel.UseNpx) {
        & vercel @args 2>&1 | Tee-Object -FilePath $log -Append
    }
    else {
        if ($Yes) { & npx --yes vercel @args 2>&1 | Tee-Object -FilePath $log -Append }
        else { & npx vercel @args 2>&1 | Tee-Object -FilePath $log -Append }
    }
    $exit = $LASTEXITCODE
}
finally {
    Pop-Location
    if ($EnableSpawnTrace) {
        if ($oldNodeOptions) { $env:NODE_OPTIONS = $oldNodeOptions } else { Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue }
        Remove-Item Env:CODEX_SPAWN_TRACE_LOG -ErrorAction SilentlyContinue
        Remove-Item Env:CODEX_SPAWN_ENVFIX -ErrorAction SilentlyContinue
    }
    if ($renamed -and (Test-Path -LiteralPath $bakFile)) {
        Move-Item -LiteralPath $bakFile -Destination $envFile -Force
        Add-Content -Path $log -Value ("[vercel-build-debug] env restored from {0}" -f $bakFile)
    }
}

Add-Content -Path $log -Value ("[vercel-build-debug] exit={0}" -f $exit)
exit $exit
