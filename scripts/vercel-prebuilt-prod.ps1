[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$RepoRoot = "",
    [switch]$Yes,
    [switch]$PostDeploySmoke,
    [int]$SmokeTimeoutSec = 60
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

    Write-Host "[vercel-prebuilt][DBG] SystemRoot=$env:SystemRoot"
    Write-Host "[vercel-prebuilt][DBG] ComSpec=$env:ComSpec"
    Write-Host "[vercel-prebuilt][DBG] Path contains System32=$($env:Path -match [regex]::Escape($system32))"

    & $env:ComSpec /c "where cmd && echo CMD_OK" | ForEach-Object { Write-Host "[vercel-prebuilt][DBG] $_" }

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

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Action
    )
    Write-Host "[vercel-prebuilt] ==> $Name"
    $global:LASTEXITCODE = 0
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "[vercel-prebuilt] Step '$Name' FAILED (exit=$LASTEXITCODE)"
    }
    Write-Host "[vercel-prebuilt] <== $Name OK"
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
    Write-Host "[vercel-prebuilt][CMD] $cmdLine"

    if ($script:UseNpx) {
        if ($Yes) { & npx --yes vercel @VercelArgs }
        else { & npx vercel @VercelArgs }
    }
    else {
        & vercel @VercelArgs
    }
}

function Invoke-VercelCapture {
    param([Parameter(Mandatory = $true)][string[]]$VercelArgs)

    $cmdLine = ($script:UseNpx ? "npx vercel" : "vercel") + " " + ($VercelArgs -join " ")
    Write-Host "[vercel-prebuilt][CMD] $cmdLine"

    if ($script:UseNpx) {
        if ($Yes) { return @(& npx --yes vercel @VercelArgs 2>&1 | Tee-Object -Variable _out) }
        return @(& npx vercel @VercelArgs 2>&1 | Tee-Object -Variable _out)
    }
    return @(& vercel @VercelArgs 2>&1 | Tee-Object -Variable _out)
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
Write-Host "[vercel-prebuilt] RepoRoot: $RepoRoot"
Write-Host "[vercel-prebuilt][DBG] invoker=$($script:UseNpx ? 'npx vercel' : 'vercel')"

Ensure-WindowsCmd

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
        & pwsh -NoProfile -ExecutionPolicy Bypass -File $reset -RepoRoot $RepoRoot
    }

    # versions
    Invoke-Step -Name "node-version"  -Action { & node --version }
    Invoke-Step -Name "npm-version"   -Action { & npm --version }
    Invoke-Step -Name "vercel-version" -Action { Invoke-Vercel @("--version") }

    # pull env + settings (production)
    Invoke-Step -Name "vercel-pull-prod-env" -Action {
        $vArgs = @("pull") + $vercelYes + @("--environment", "production")
        Invoke-Vercel $vArgs
    }

    # build prebuilt prod (LOCAL)
    Invoke-Step -Name "vercel-build-prod" -Action {
        $vArgs = @("build", "--prod") + $vercelYes
        Invoke-Vercel $vArgs
    }

    # deploy prebuilt prod
    $script:LastDeployLines = @()
    Invoke-Step -Name "vercel-deploy-prebuilt-prod" -Action {
        $vArgs = @("deploy", "--prebuilt", "--prod") + $vercelYes
        $script:LastDeployLines = Invoke-VercelCapture $vArgs
    }

    $deployUrl = Extract-DeployUrl $script:LastDeployLines
    if ($PostDeploySmoke) {
        if ([string]::IsNullOrWhiteSpace($deployUrl)) {
            Write-Host "[vercel-prebuilt][WARN] deploy URL not found => smoke skipped" -ForegroundColor Yellow
        }
        else {
            $smokeApi = Join-Path $RepoRoot "scripts\smoke-api.ps1"
            Write-Host "[vercel-prebuilt] post-deploy smoke-api => $deployUrl"
            & pwsh -NoProfile -ExecutionPolicy Bypass -File $smokeApi -BaseUrl $deployUrl -TimeoutSec $SmokeTimeoutSec -RequireCitations
        }
    }

    Write-Host "[vercel-prebuilt] OK" -ForegroundColor Green
}
finally {
    Pop-Location
}
