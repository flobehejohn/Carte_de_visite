Set-StrictMode -Version Latest

function Ensure-Dir {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return }
    if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Force -Path $Path | Out-Null }
}

function Resolve-RepoRoot {
    param(
        [string]$RepoRoot,
        [string]$ScriptDir
    )
    if (-not [string]::IsNullOrWhiteSpace($RepoRoot)) {
        return (Resolve-Path $RepoRoot).Path
    }
    if ([string]::IsNullOrWhiteSpace($ScriptDir)) {
        throw "ScriptDir missing for repo root fallback."
    }
    return (Resolve-Path (Join-Path $ScriptDir "..")).Path
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
    return (Resolve-Path $abs).Path
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
        $val = [string]$env:$v
        if (-not [string]::IsNullOrWhiteSpace($val) -and $val -ne "false") { return "ci" }
    }
    return "local"
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

    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $repoRootAbs = Resolve-RepoRoot -RepoRoot $RepoRoot -ScriptDir $scriptDir
    $modeValue = Detect-AuditMode -Mode $Mode
    $outDirAbs = Resolve-OutDirAbs -RepoRoot $repoRootAbs -OutDir $OutDir -DefaultSubDir ".\audit"

    $baseDir = if ([string]::IsNullOrWhiteSpace($Category)) { $outDirAbs } else { Join-Path $outDirAbs $Category }
    Ensure-Dir $baseDir

    $git = Get-GitInfo -RepoRoot $repoRootAbs
    $runId = $null
    foreach ($k in @("GITHUB_RUN_ID", "GITHUB_RUN_NUMBER", "BUILD_BUILDID", "CI_PIPELINE_ID", "BUILD_NUMBER", "BUILD_ID")) {
        if (-not [string]::IsNullOrWhiteSpace($env:$k)) { $runId = $env:$k; break }
    }

    $effectiveRunStamp = $RunStamp
    if ($modeValue -eq "local" -and -not $Archive) {
        $effectiveRunStamp = "LATEST"
        $runDir = Join-Path $baseDir "_latest"
        if ($CleanLatest -and (Test-Path $runDir)) {
            Get-ChildItem -Path $runDir -Force | Remove-Item -Recurse -Force
        }
    }
    else {
        if ([string]::IsNullOrWhiteSpace($effectiveRunStamp)) {
            $ts = (Get-Date).ToString("yyyyMMdd_HHmmss")
            $effectiveRunStamp = "{0}_{1}" -f $Prefix, $ts
            if ($modeValue -eq "ci") {
                if (-not [string]::IsNullOrWhiteSpace($git.shortSha)) { $effectiveRunStamp += "_$($git.shortSha)" }
                if (-not [string]::IsNullOrWhiteSpace($runId)) { $effectiveRunStamp += "_$runId" }
            }
        }
        $runDir = Join-Path $baseDir $effectiveRunStamp
    }

    Ensure-Dir $runDir

    return [pscustomobject]@{
        RepoRoot   = $repoRootAbs
        Mode       = $modeValue
        Archive    = [bool]$Archive
        OutDir     = $outDirAbs
        BaseDir    = $baseDir
        RunStamp   = $effectiveRunStamp
        RunDir     = $runDir
        Manifest   = (Join-Path $runDir "audit-manifest.json")
        Git        = $git
        RunId      = $runId
        Timestamp  = (Get-Date).ToString("o")
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
