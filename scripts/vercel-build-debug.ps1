[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$RepoRoot = "",
    [string]$LocalConfig = "",
    [string]$AuditLogPath = "",
    [string]$Stamp = "",
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

Add-Content -Path $log -Value ("[vercel-build-debug] start stamp={0}" -f $stamp)
Add-Content -Path $log -Value ("[vercel-build-debug] repo={0}" -f $RepoRoot)
Add-Content -Path $log -Value ("[vercel-build-debug] envFile={0}" -f $envFile)

if (Test-Path -LiteralPath $envFile) {
    $bakFile = "$envFile.bak_$stamp"
    Move-Item -LiteralPath $envFile -Destination $bakFile -Force
    $renamed = $true
    Add-Content -Path $log -Value ("[vercel-build-debug] env renamed => {0}" -f $bakFile)
}
else {
    Add-Content -Path $log -Value "[vercel-build-debug] env file not found, no rename"
}

Push-Location $RepoRoot
try {
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
    if ($renamed -and (Test-Path -LiteralPath $bakFile)) {
        Move-Item -LiteralPath $bakFile -Destination $envFile -Force
        Add-Content -Path $log -Value ("[vercel-build-debug] env restored from {0}" -f $bakFile)
    }
}

Add-Content -Path $log -Value ("[vercel-build-debug] exit={0}" -f $exit)
exit $exit
