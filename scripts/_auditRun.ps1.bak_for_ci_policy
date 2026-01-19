Set-StrictMode -Version Latest

# Stable script dir (safe under StrictMode even inside functions)
$script:AuditRunScriptDir = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($script:AuditRunScriptDir) -and $MyInvocation -and $MyInvocation.MyCommand) {
    try { $script:AuditRunScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path } catch { }
}

function Ensure-Dir {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return }

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Force -Path $Path | Out-Null
    }
}

function Resolve-OnePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $resolved = Resolve-Path -LiteralPath $Path -ErrorAction Stop
    if ($null -eq $resolved) { throw "Resolve-Path returned null for: $Path" }

    $first = $resolved | Select-Object -First 1
    if ($null -eq $first) { throw "Resolve-Path returned empty result for: $Path" }

    $p = $first.PSObject.Properties["Path"]
    if ($p -and -not [string]::IsNullOrWhiteSpace([string]$p.Value)) {
        return [string]$p.Value
    }

    $s = [string]$first
    if (-not [string]::IsNullOrWhiteSpace($s)) { return $s }

    throw "Resolve-Path produced an unexpected result for: $Path"
}

function Resolve-RepoRoot {
    param(
        [string]$RepoRoot,
        [string]$ScriptDir
    )

    if (-not [string]::IsNullOrWhiteSpace($RepoRoot)) {
        return (Resolve-OnePath -Path $RepoRoot)
    }

    if ([string]::IsNullOrWhiteSpace($ScriptDir)) {
        throw "ScriptDir missing for repo root fallback."
    }

    return (Resolve-OnePath -Path (Join-Path $ScriptDir ".."))
}

function Resolve-OutDirAbs {
    param(
        [string]$RepoRoot,
        [string]$OutDir,
        [string]$DefaultSubDir
    )

    $dir = if ([string]::IsNullOrWhiteSpace($OutDir)) { $DefaultSubDir } else { $OutDir }
    $abs = if ([System.IO.Path]::IsPathRooted($dir)) { $dir } else { Join-Path $RepoRoot $dir }

    Ensure-Dir $abs
    return (Resolve-OnePath -Path $abs)
}

function Detect-AuditMode {
    param([string]$Mode)

    if (-not [string]::IsNullOrWhiteSpace($Mode)) {
        $m = $Mode.ToLowerInvariant()
        if ($m -ne "local" -and $m -ne "ci") { throw "Invalid Mode: $Mode (expected local|ci)" }
        return $m
    }

    $ciVars = @(
        "CI",
        "GITHUB_ACTIONS",
        "GITLAB_CI",
        "TF_BUILD",
        "BUILD_BUILDID",
        "TEAMCITY_VERSION",
        "JENKINS_URL",
        "BUILDKITE",
        "APPVEYOR"
    )
    foreach ($v in $ciVars) {
        $val = [string][Environment]::GetEnvironmentVariable($v)
        if (-not [string]::IsNullOrWhiteSpace($val) -and $val -ne "false") { return "ci" }
    }
    return "local"
}

# ✅ Policy centrale : CI par défaut => Quiet=true, Keep=1, latest-only (sauf -Archive)
function Get-AuditPolicy {
    [CmdletBinding()]
    param(
        [string]$Mode,
        [switch]$Archive
    )

    $m = Detect-AuditMode -Mode $Mode

    $quietDefault = ($m -eq "ci")
    $keepDefault = if ($m -eq "ci") { 1 } else { 3 }

    # latest-only en CI sauf si -Archive explicitement demandé
    $latestOnly = ($m -eq "ci" -and -not $Archive)

    return [pscustomobject]@{
        Mode         = $m
        QuietDefault = $quietDefault
        KeepDefault  = $keepDefault
        LatestOnly   = $latestOnly
    }
}

function Get-GitInfo {
    param([string]$RepoRoot)

    $info = [ordered]@{
        available = $false
        sha       = $null
        shortSha  = $null
        branch    = $null
        dirty     = $null
    }

    try {
        Push-Location $RepoRoot
        $info.available = $true
        $info.sha = (git rev-parse HEAD) 2>$null
        $info.shortSha = (git rev-parse --short HEAD) 2>$null
        $info.branch = (git rev-parse --abbrev-ref HEAD) 2>$null
        $info.dirty = [bool]((git status --porcelain) 2>$null)
    }
    catch { }
    finally { Pop-Location }

    return $info
}

function Resolve-AuditRun {
    [CmdletBinding()]
    param(
        [string]$RepoRoot,
        [string]$OutDir,
        [string]$RunStamp,
        [string]$Mode,
        [switch]$Archive,
        [string]$Category = "",
        [string]$Prefix = "VALID",
        [switch]$CleanLatest
    )

    $scriptDir = $script:AuditRunScriptDir
    $repoRootAbs = Resolve-RepoRoot -RepoRoot $RepoRoot -ScriptDir $scriptDir

    $policy = Get-AuditPolicy -Mode $Mode -Archive:$Archive
    $modeValue = $policy.Mode

    # 🔒 On garde OutDir comme "racine audit". En CI latest-only, on force l’écriture dans <OutDir>/_latest
    $outDirAbs = Resolve-OutDirAbs -RepoRoot $repoRootAbs -OutDir $OutDir -DefaultSubDir ".\audit"

    $centralLatestRoot = Join-Path $outDirAbs "_latest"

    # BaseDir dépend de la policy:
    # - CI latest-only => audit/_latest[/Category]
    # - sinon => audit[/Category]
    $baseRoot = if ($policy.LatestOnly) { $centralLatestRoot } else { $outDirAbs }
    $baseDir = if ([string]::IsNullOrWhiteSpace($Category)) { $baseRoot } else { Join-Path $baseRoot $Category }
    Ensure-Dir $baseDir

    $git = Get-GitInfo -RepoRoot $repoRootAbs
    $runId = $null
    foreach ($k in @("GITHUB_RUN_ID", "GITHUB_RUN_NUMBER", "BUILD_BUILDID", "CI_PIPELINE_ID", "BUILD_NUMBER", "BUILD_ID")) {
        $envVal = [Environment]::GetEnvironmentVariable($k)
        if (-not [string]::IsNullOrWhiteSpace($envVal)) { $runId = $envVal; break }
    }

    $effectiveRunStamp = $RunStamp
    if ([string]::IsNullOrWhiteSpace($effectiveRunStamp)) {
        $ts = (Get-Date).ToString("yyyyMMdd_HHmmss")
        $effectiveRunStamp = "{0}_{1}" -f $Prefix, $ts

        if ($modeValue -eq "ci") {
            if (-not [string]::IsNullOrWhiteSpace($git.shortSha)) { $effectiveRunStamp += "_$($git.shortSha)" }
            if (-not [string]::IsNullOrWhiteSpace($runId)) { $effectiveRunStamp += "_$runId" }
        }
    }

    # ✅ CI latest-only : RunDir = BaseDir (directement), nettoyage automatique
    if ($policy.LatestOnly) {
        $runDir = $baseDir
        Ensure-Dir $runDir

        # En CI, on nettoie systématiquement pour éviter les reliquats
        Get-ChildItem -LiteralPath $runDir -Force -ErrorAction SilentlyContinue |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

        return [pscustomobject]@{
            RepoRoot     = $repoRootAbs
            Mode         = $modeValue
            Archive      = [bool]$Archive
            OutDir       = $outDirAbs
            BaseDir      = $baseDir
            RunStamp     = $effectiveRunStamp
            RunDir       = $runDir
            Manifest     = (Join-Path $runDir "audit-manifest.json")
            Git          = $git
            RunId        = $runId
            Timestamp    = (Get-Date).ToString("o")

            QuietDefault = [bool]$policy.QuietDefault
            KeepDefault  = [int]$policy.KeepDefault
            LatestOnly   = [bool]$policy.LatestOnly
            LatestRoot   = $centralLatestRoot
        }
    }

    # 🟦 Comportement existant (non CI latest-only)
    if ($modeValue -eq "local" -and -not $Archive) {
        $runDir = Join-Path $baseDir "_latest"
        Ensure-Dir $runDir

        if ($CleanLatest -and (Test-Path -LiteralPath $runDir)) {
            Get-ChildItem -LiteralPath $runDir -Force -ErrorAction SilentlyContinue |
            Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
    else {
        $runDir = Join-Path $baseDir $effectiveRunStamp
        Ensure-Dir $runDir
    }

    return [pscustomobject]@{
        RepoRoot     = $repoRootAbs
        Mode         = $modeValue
        Archive      = [bool]$Archive
        OutDir       = $outDirAbs
        BaseDir      = $baseDir
        RunStamp     = $effectiveRunStamp
        RunDir       = $runDir
        Manifest     = (Join-Path $runDir "audit-manifest.json")
        Git          = $git
        RunId        = $runId
        Timestamp    = (Get-Date).ToString("o")

        QuietDefault = [bool]$policy.QuietDefault
        KeepDefault  = [int]$policy.KeepDefault
        LatestOnly   = [bool]$policy.LatestOnly
        LatestRoot   = $centralLatestRoot
    }
}

function Write-AuditManifest {
    [CmdletBinding()]
    param(
        [string]$Path,
        [hashtable]$Payload
    )

    Ensure-Dir (Split-Path -Parent $Path)
    ($Payload | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Write-AuditLatest {
    [CmdletBinding()]
    param(
        [string]$Category,
        [string]$RunDir,
        [string]$LatestDir,
        [int]$Keep = 3
    )

    if ([string]::IsNullOrWhiteSpace($RunDir)) { throw "RunDir missing for audit copy." }
    if ([string]::IsNullOrWhiteSpace($LatestDir)) { throw "LatestDir missing for audit copy." }

    # ✅ En CI: Keep max = 1 (même si on oublie)
    $modeValue = Detect-AuditMode -Mode ""
    if ($modeValue -eq "ci" -and $Keep -gt 1) { $Keep = 1 }

    Ensure-Dir $RunDir
    Ensure-Dir (Split-Path -Parent $LatestDir)
    Ensure-Dir $LatestDir

    # ⚠️ Si on copie vers soi-même (cas latest-only), on ne fait rien
    try {
        $runAbs = (Resolve-OnePath -Path $RunDir).ToLowerInvariant()
        $latAbs = (Resolve-OnePath -Path $LatestDir).ToLowerInvariant()
        if ($runAbs -eq $latAbs) { return $LatestDir }
    }
    catch { }

    if (Test-Path -LiteralPath $LatestDir) { Remove-Item -Recurse -Force -LiteralPath $LatestDir }
    Copy-Item -Recurse -Force $RunDir $LatestDir

    # Prune dans le dossier parent de RunDir (sauf _latest)
    $baseDir = Split-Path -Parent $RunDir
    if (Test-Path -LiteralPath $baseDir) {
        $dirs = Get-ChildItem -LiteralPath $baseDir -Directory |
        Where-Object { $_.Name -ne "_latest" } |
        Sort-Object LastWriteTime -Descending

        if ($Keep -gt 0) {
            $i = 0
            foreach ($d in $dirs) {
                $i++
                if ($i -le $Keep) { continue }
                Remove-Item -LiteralPath $d.FullName -Recurse -Force
            }
        }
    }

    return $LatestDir
}
