[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$RepoRoot = "",
    [string]$LocalConfig = "",
    [string]$AuditLogPath = "",
    [string]$Stamp = "",
    [switch]$Yes,
    [switch]$PostDeploySmoke,
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

    # pull env + settings (production)
    Invoke-Step -Name "vercel-pull-prod-env" -Action {
        $vArgs = @("pull") + $vercelYes + @("--environment", "production") + $localConfigArgs
        Invoke-Vercel $vArgs
    }

    # build prebuilt prod (LOCAL)
    Invoke-Step -Name "vercel-build-prod" -Action {
        $vArgs = @("build", "--prod") + $vercelYes + $localConfigArgs
        Invoke-Vercel $vArgs
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
