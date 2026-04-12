[CmdletBinding()]
param(
    [int]$LatestCap = 40,
    [string]$RepoRoot = "",
    [string[]]$EntryPoints = @(
        "scripts/gate.ps1",
        "scripts/validate-full.ps1",
        "scripts/gate-render.ps1",
        "scripts/gate-presets.ps1"
    )
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function CountOf([object]$x) { return @($x).Count }

function Ok([string]$m) { Write-Host "[OK]  $m" -ForegroundColor Green }
function Err([string]$m) { Write-Host "[ERR] $m" -ForegroundColor Red }

function Fail([string]$m) {
    Err $m
    exit 1
}

function Resolve-RepoRootLocal([string]$RepoRoot, [string]$ScriptDir) {
    if (-not [string]::IsNullOrWhiteSpace($RepoRoot)) {
        return (Resolve-Path -LiteralPath $RepoRoot -ErrorAction Stop).Path
    }
    return (Resolve-Path -LiteralPath (Join-Path $ScriptDir "..") -ErrorAction Stop).Path
}

function Get-StagedPaths {
    try {
        # Retourne une liste (tableau) même si 1 seule ligne
        return @(& git diff --cached --name-only --diff-filter=ACMR 2>$null)
    }
    catch {
        return @()
    }
}

function Try-GetStagedText([string]$relUnixPath) {
    try {
        # Contenu stagé : git show :path
        return (& git show (":$relUnixPath") 2>$null) -join "`n"
    }
    catch {
        return $null
    }
}

function Get-FileText([string]$repoRootAbs, [string]$relUnixPath, [string[]]$stagedSet) {
    if ($stagedSet -contains $relUnixPath) {
        $t = Try-GetStagedText -relUnixPath $relUnixPath
        if (-not [string]::IsNullOrEmpty($t)) { return $t }
    }
    $diskPath = Join-Path $repoRootAbs ($relUnixPath -replace "/", "\")
    if (-not (Test-Path -LiteralPath $diskPath)) { return $null }
    return Get-Content -Raw -LiteralPath $diskPath
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRootAbs = Resolve-RepoRootLocal -RepoRoot $RepoRoot -ScriptDir $ScriptDir

Push-Location $repoRootAbs
try {
    # 0) Exiger git (pré-commit)
    try { & git rev-parse --is-inside-work-tree | Out-Null } catch { Fail "git not available or not a repo." }

    $staged = Get-StagedPaths
    # Normaliser en chemins unix (git renvoie déjà souvent en /)
    $staged = @($staged | ForEach-Object { ($_ -replace "\\", "/").Trim() } | Where-Object { $_ -ne "" })

    # 1) StrictMode sur tout .ps1 stagé (sauf scripts/_lib/)
    $ps1Staged = @($staged | Where-Object { $_ -match '\.ps1$' -and $_ -match '^scripts/' -and $_ -notmatch '^scripts/_lib/' })
    $missingStrict = New-Object System.Collections.Generic.List[string]

    foreach ($p in $ps1Staged) {
        $text = Get-FileText -repoRootAbs $repoRootAbs -relUnixPath $p -stagedSet $staged
        if ([string]::IsNullOrWhiteSpace($text)) {
            $missingStrict.Add("$p (unreadable)") | Out-Null
            continue
        }
        if ($text -notmatch "Set-StrictMode\s+-Version\s+Latest") {
            $missingStrict.Add($p) | Out-Null
        }
    }

    if (CountOf $missingStrict -gt 0) {
        $missingStrict | ForEach-Object { Err "Missing StrictMode in staged script: $_" }
        Fail "verify-contract: StrictMode missing."
    }
    Ok "StrictMode: OK (staged scripts)"

    # 2) Entrypoints : imports Log + _auditRun + StrictMode
    foreach ($ep in $EntryPoints) {
        $epNorm = ($ep -replace "\\", "/").Trim()
        $text = Get-FileText -repoRootAbs $repoRootAbs -relUnixPath $epNorm -stagedSet $staged
        if ([string]::IsNullOrWhiteSpace($text)) { Fail "Missing or unreadable entrypoint: $epNorm" }

        if ($text -notmatch "Set-StrictMode\s+-Version\s+Latest") { Fail "Missing StrictMode in entrypoint: $epNorm" }
        if ($text -notmatch "_auditRun\.ps1") { Fail "Missing _auditRun.ps1 import in entrypoint: $epNorm" }
        if ($text -notmatch "_lib[\\/]+Log\.ps1") { Fail "Missing Log.ps1 import in entrypoint: $epNorm" }
    }
    Ok "Entrypoints contract: OK (StrictMode + Log + _auditRun)"

    # 3) audit/_latest cap
    $latestDir = Join-Path $repoRootAbs "audit\_latest"
    if (Test-Path -LiteralPath $latestDir) {
        $latestCount = @(Get-ChildItem -LiteralPath $latestDir -Recurse -File -ErrorAction SilentlyContinue).Count
        if ($latestCount -gt $LatestCap) {
            Fail "_latest too big ($latestCount > $LatestCap). Run cleanup/prune before commit."
        }
        Ok "_latest cap: OK ($latestCount <= $LatestCap)"
    }
    else {
        Ok "audit/_latest absent: OK"
    }

    Ok "verify-contract: OK"
    exit 0
}
catch {
    Fail ("verify-contract: " + $_.Exception.Message)
}
finally {
    Pop-Location
}
