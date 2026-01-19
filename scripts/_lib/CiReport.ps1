Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Now-Stamp { (Get-Date).ToString("yyyyMMdd_HHmmss") }

function Normalize-RelPath([string]$p) {
    if ([string]::IsNullOrWhiteSpace($p)) { return $p }
    # IMPORTANT: pas de regex -replace ici (évite les surprises avec '\')
    return $p.Trim().Replace('/', '\')
}

function Ensure-Dir {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Path)

    $p = [string]$Path
    if ([string]::IsNullOrWhiteSpace($p)) { throw "Ensure-Dir: Path vide" }

    if (-not (Test-Path -LiteralPath $p)) {
        New-Item -ItemType Directory -Path $p -Force | Out-Null
    }
    return (Resolve-Path -LiteralPath $p).Path
}

function Write-JsonFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][object]$Object,
        [int]$Depth = 60
    )

    $p = [string]$Path
    if ([string]::IsNullOrWhiteSpace($p)) { throw "Write-JsonFile: Path vide" }

    $parent = Split-Path -Parent $p
    if ($parent) { Ensure-Dir -Path ([string]$parent) | Out-Null }

    # ConvertTo-Json => string OU string[]
    $jsonAny = $Object | ConvertTo-Json -Depth $Depth
    $json = if ($jsonAny -is [string[]]) { ($jsonAny -join "`r`n") } else { [string]$jsonAny }

    # Écriture 100% déterministe : FileStream + StreamWriter UTF8 (sans BOM)
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    $fs = $null
    $sw = $null
    try {
        $fs = [System.IO.File]::Open(
            $p,
            [System.IO.FileMode]::Create,
            [System.IO.FileAccess]::Write,
            [System.IO.FileShare]::Read
        )
        $sw = New-Object System.IO.StreamWriter($fs, $utf8)
        $sw.Write($json)
        $sw.Flush()
    }
    finally {
        if ($sw) { $sw.Dispose() }
        if ($fs) { $fs.Dispose() }
    }
}

function Try-GetGitInfo {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$RepoRoot)

    try {
        Push-Location $RepoRoot
        try { & git rev-parse --is-inside-work-tree | Out-Null } catch { return $null }

        $sha = (& git rev-parse HEAD 2>$null) | Select-Object -First 1
        $branch = (& git rev-parse --abbrev-ref HEAD 2>$null) | Select-Object -First 1
        $dirty = $false
        try {
            $porc = & git status --porcelain 2>$null
            if ($porc -and @($porc).Count -gt 0) { $dirty = $true }
        }
        catch {}

        return [pscustomobject]@{
            sha    = [string]$sha
            branch = [string]$branch
            dirty  = [bool]$dirty
        }
    }
    finally {
        Pop-Location -ErrorAction SilentlyContinue
    }
}

function Resolve-CiDirs {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string]$RunStamp,
        [string]$LatestDirRel = "audit/_latest/ci",
        [string]$HistoryDirRel = "audit/ci/runs"
    )

    $latestRel = Normalize-RelPath ([string]$LatestDirRel)
    $histRel = Normalize-RelPath ([string]$HistoryDirRel)

    $latestAbs = Ensure-Dir -Path (Join-Path ([string]$RepoRoot) $latestRel)
    $latestStepsAbs = Ensure-Dir -Path (Join-Path $latestAbs "steps")

    $historyRootAbs = Ensure-Dir -Path (Join-Path ([string]$RepoRoot) $histRel)
    $historyRunAbs = Ensure-Dir -Path (Join-Path $historyRootAbs ([string]$RunStamp))
    $historyStepsAbs = Ensure-Dir -Path (Join-Path $historyRunAbs "steps")

    return [pscustomobject]@{
        RepoRoot           = [string]$RepoRoot
        RunStamp           = [string]$RunStamp

        LatestDirRel       = $latestRel
        HistoryDirRel      = $histRel

        LatestDirAbs       = $latestAbs
        LatestStepsDirAbs  = $latestStepsAbs

        HistoryRunsRootAbs = $historyRootAbs
        HistoryRunDirAbs   = $historyRunAbs
        HistoryStepsDirAbs = $historyStepsAbs

        LatestReportAbs    = (Join-Path $latestAbs "ci-report.json")
        HistoryReportAbs   = (Join-Path $historyRunAbs "ci-report.json")
    }
}

function New-StepReport {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][int]$SchemaVersion,
        [Parameter(Mandatory)][object]$Run,
        [Parameter(Mandatory)][object]$Step,
        [Parameter(Mandatory)][object]$Result,
        [object]$Artifacts = $null,
        [string[]]$Provides = @(),
        [string[]]$Requires = @(),
        [object]$Metrics = $null,
        [object]$Git = $null
    )

    return [ordered]@{
        schemaVersion = [int]$SchemaVersion
        run           = $Run
        git           = $Git
        step          = $Step
        result        = $Result
        metrics       = $Metrics
        provides      = @($Provides)
        requires      = @($Requires)
        artifacts     = $Artifacts
    }
}

function Write-StepReportFiles {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][object]$CiDirs,
        [Parameter(Mandatory)][string]$StepId,
        [Parameter(Mandatory)][object]$ReportObject
    )

    $file = ([string]$StepId) + ".json"

    $latestAbs = Join-Path ([string]$CiDirs.LatestStepsDirAbs)  $file
    $historyAbs = Join-Path ([string]$CiDirs.HistoryStepsDirAbs) $file

    Write-JsonFile -Path $latestAbs  -Object $ReportObject -Depth 60
    Write-JsonFile -Path $historyAbs -Object $ReportObject -Depth 60

    $latestRel = Join-Path ([string]$CiDirs.LatestDirRel)  ("steps\" + $file)
    $historyRel = Join-Path ([string]$CiDirs.HistoryDirRel) (([string]$CiDirs.RunStamp) + "\steps\" + $file)

    return [pscustomobject]@{
        latestAbs  = $latestAbs
        historyAbs = $historyAbs
        latestRel  = $latestRel
        historyRel = $historyRel
    }
}

function Write-RunReportFiles {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][object]$CiDirs,
        [Parameter(Mandatory)][object]$RunReportObject
    )

    Write-JsonFile -Path ([string]$CiDirs.LatestReportAbs)  -Object $RunReportObject -Depth 60
    Write-JsonFile -Path ([string]$CiDirs.HistoryReportAbs) -Object $RunReportObject -Depth 60

    return [pscustomobject]@{
        latestAbs  = [string]$CiDirs.LatestReportAbs
        historyAbs = [string]$CiDirs.HistoryReportAbs
    }
}
