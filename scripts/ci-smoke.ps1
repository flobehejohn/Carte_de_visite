[CmdletBinding()]
param(
    [string]$RepoRoot = "",
    [string]$ManifestPath = "scripts\ci.manifest.json",

    [string[]]$IncludeTags = @(),
    [string[]]$ExcludeTags = @(),
    [string[]]$OnlyIds = @(),

    [switch]$AlwaysCleanup,
    [switch]$ListSteps
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Log([string]$level, [string]$msg, [ConsoleColor]$color = [ConsoleColor]::Gray) {
    Write-Host "[$level] $msg" -ForegroundColor $color
}
function Info([string]$m) { Log "INFO" $m ([ConsoleColor]::Gray) }
function Ok([string]$m) { Log "OK"   $m ([ConsoleColor]::Green) }
function Warn([string]$m) { Log "WARN" $m ([ConsoleColor]::Yellow) }
function Err([string]$m) { Log "ERR"  $m ([ConsoleColor]::Red) }

function Assert-Path {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Path, [string]$Label = "")
    if (-not (Test-Path -LiteralPath $Path)) {
        $name = if ($Label) { $Label } else { $Path }
        throw "Contrat rompu: introuvable => $name (path: $Path)"
    }
}

# SAFE JSON access
function Try-GetPropValue([object]$Obj, [string]$Name) {
    $p = $Obj.PSObject.Properties[$Name]
    if ($null -ne $p) { return $p.Value }
    try { return ($Obj | Select-Object -ExpandProperty $Name -ErrorAction SilentlyContinue) } catch { return $null }
}
function Get-StringProp([object]$Obj, [string]$Name, [string]$Default = "") {
    $v = Try-GetPropValue $Obj $Name
    if ($null -eq $v) { return $Default }
    $s = [string]$v
    if ([string]::IsNullOrWhiteSpace($s)) { return $Default }
    return $s
}
function Get-ArrayProp([object]$Obj, [string]$Name) {
    $v = Try-GetPropValue $Obj $Name
    if ($null -eq $v) { return @() }
    if ($v -is [string]) { return @([string]$v) }
    return @($v)
}

function Normalize-Tags([object]$tags) {
    if ($null -eq $tags) { return @() }
    if ($tags -is [string]) { return @($tags) }
    return @($tags)
}

function Matches-Filters([pscustomobject]$step) {
    $tags = @($step.tags)
    $id = [string]$step.id

    if ($OnlyIds.Count -gt 0 -and ($OnlyIds -notcontains $id)) { return $false }

    if ($IncludeTags.Count -gt 0) {
        $hit = $false
        foreach ($t in $IncludeTags) { if ($tags -contains $t) { $hit = $true; break } }
        if (-not $hit) { return $false }
    }

    if ($ExcludeTags.Count -gt 0) {
        foreach ($t in $ExcludeTags) { if ($tags -contains $t) { return $false } }
    }

    return $true
}

function Invoke-Step {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Name, [Parameter(Mandatory)][scriptblock]$Action)
    Info "==> $Name"
    & $Action
    if ($LASTEXITCODE -ne $null -and $LASTEXITCODE -ne 0) {
        throw "Étape '$Name' a échoué (exit code: $LASTEXITCODE)."
    }
    Ok "<== $Name OK"
}

function Get-DurationMs {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][datetime]$Start,
        [Parameter(Mandatory)][datetime]$End
    )
    $ms = (($End - $Start).TotalMilliseconds)
    if (-not [double]::IsFinite($ms)) { return [int64]0 }
    return [int64][math]::Round($ms)
}

# ---- state
$script:root = $null
$script:cleanupStep = $null
$script:capabilities = New-Object System.Collections.Generic.HashSet[string]
$script:stepReports = New-Object System.Collections.Generic.List[object]
$script:ciDirs = $null
$script:ciLatestDirRel = "audit/_latest/ci"
$script:ciHistoryDirRel = "audit/ci/runs"

# StrictMode safe init
$runStamp = $null
$git = $null

$runStartedAt = Get-Date
$didRun = $false

try {
    $scriptRoot = $PSScriptRoot
    $script:root = if (-not [string]::IsNullOrWhiteSpace($RepoRoot)) { (Resolve-Path $RepoRoot).Path }
                   else { (Resolve-Path (Join-Path $scriptRoot "..")).Path }

    Set-Location $script:root
    Info "Repo root: $script:root"

    # load lib
    $ciLib = Join-Path $scriptRoot "_lib\CiReport.ps1"
    Assert-Path -Path $ciLib -Label "scripts/_lib/CiReport.ps1"
    . $ciLib

    $runStamp = Now-Stamp
    $git = Try-GetGitInfo -RepoRoot $script:root

    # manifest
    $manifestAbs = Join-Path $script:root $ManifestPath
    Assert-Path -Path $manifestAbs -Label "ci.manifest.json"
    $manifest = (Get-Content -LiteralPath $manifestAbs -Raw -Encoding UTF8) | ConvertFrom-Json

    $schema = [int](Get-StringProp $manifest "schemaVersion" "0")
    if ($schema -ne 1) { throw "Manifest schemaVersion incompatible: $schema (attendu: 1)" }

    $ciCfg = Try-GetPropValue $manifest "ci"
    if ($null -ne $ciCfg) {
        $script:ciLatestDirRel = Get-StringProp $ciCfg "latestDir" "audit/_latest/ci"
        $script:ciHistoryDirRel = Get-StringProp $ciCfg "historyRunsDir" "audit/ci/runs"
    }

    $script:ciDirs = Resolve-CiDirs -RepoRoot $script:root -RunStamp $runStamp `
        -LatestDirRel $script:ciLatestDirRel -HistoryDirRel $script:ciHistoryDirRel

    $stepsJson = Try-GetPropValue $manifest "steps"
    if ($null -eq $stepsJson -or @($stepsJson).Count -eq 0) { throw "Manifest invalide: steps est vide." }

    # resolve steps
    $stepsResolved = @()
    foreach ($s in @($stepsJson)) {
        $idRel = Get-StringProp $s "id" ""
        $scriptRel = Get-StringProp $s "script" ""
        $name = Get-StringProp $s "name" $idRel
        if ([string]::IsNullOrWhiteSpace($idRel)) { throw "Manifest invalide: step sans id." }
        if ([string]::IsNullOrWhiteSpace($scriptRel)) { throw "Manifest invalide: step '$idRel' sans script." }

        $abs = Join-Path $script:root $scriptRel
        Assert-Path -Path $abs -Label ("step script: " + $idRel)

        $tags = Normalize-Tags (Try-GetPropValue $s "tags")
        $kind = Get-StringProp $s "kind" "normal"

        $reqs = @($(Get-ArrayProp $s "requires") | ForEach-Object { [string]$_ } | Where-Object { $_ -ne "" })
        $provs = @($(Get-ArrayProp $s "provides") | ForEach-Object { [string]$_ } | Where-Object { $_ -ne "" })

        $expectedArtifacts = @()
        $eaRaw = Try-GetPropValue $s "expectedArtifacts"
        if ($null -ne $eaRaw) { $expectedArtifacts = @($eaRaw) }

        $stepArgsRaw = Try-GetPropValue $s "args"
        $stepArgs = @()
        if ($null -ne $stepArgsRaw) { $stepArgs = @($stepArgsRaw) }

        $stepObj = [pscustomobject]@{
            id                = $idRel
            name              = $name
            script            = $abs
            rel               = $scriptRel
            tags              = @($tags)
            kind              = $kind
            requires          = $reqs
            provides          = $provs
            expectedArtifacts = $expectedArtifacts
            stepArgs          = $stepArgs
        }

        $stepsResolved += $stepObj

        if ($stepObj.kind -eq "cleanup" -or ($stepObj.tags -contains "cleanup")) {
            $script:cleanupStep = $stepObj
        }
    }

    # select
    $selected = @()
    foreach ($st in $stepsResolved) { if (Matches-Filters $st) { $selected += $st } }

    if ($ListSteps.IsPresent) {
        Info "Steps sélectionnés:"
        foreach ($st in $selected) {
            $tagStr = if ($st.tags.Count -gt 0) { ($st.tags -join ",") } else { "-" }
            Write-Host (" - {0}  ({1})  [{2}] kind={3}" -f $st.id, $st.rel, $tagStr, $st.kind)
        }
        exit 0
    }

    if ($selected.Count -eq 0) { throw "Aucun step sélectionné (filtres trop restrictifs ?)." }

    $didRun = $true

    function Assert-Requires([pscustomobject]$st) {
        foreach ($r in @($st.requires)) {
            if (-not $script:capabilities.Contains([string]$r)) {
                throw "Dépendance manquante pour '$($st.id)': requires '$r' (capabilities acquises: $(@($script:capabilities) -join ', '))"
            }
        }
    }

    function Resolve-Artifacts([pscustomobject]$st) {
        $items = New-Object System.Collections.Generic.List[object]
        foreach ($a in @($st.expectedArtifacts)) {
            $key = Get-StringProp $a "key" ""
            $pathRel = Get-StringProp $a "path" ""
            $required = Try-GetPropValue $a "required"
            $reqBool = $false
            if ($required -is [bool]) { $reqBool = [bool]$required }
            else {
                $s = [string]$required
                $reqBool = ($s -eq "true" -or $s -eq "True" -or $s -eq "1")
            }

            $abs = if ($pathRel) { Join-Path $script:root $pathRel } else { $null }
            $exists = if ($abs) { Test-Path -LiteralPath $abs } else { $false }

            $items.Add([pscustomobject]@{
                key      = $key
                path     = $pathRel
                abs      = $abs
                required = [bool]$reqBool
                exists   = [bool]$exists
            }) | Out-Null
        }
        return $items
    }

    foreach ($st in $selected) {
        Assert-Requires $st

        $t0 = Get-Date
        $okStep = $false
        $exitCode = 0
        $errMsg = $null

        try {
            Invoke-Step $st.name {
                if ($st.stepArgs.Count -gt 0) {
                    pwsh -NoProfile -ExecutionPolicy Bypass -File $st.script @($st.stepArgs)
                }
                else {
                    pwsh -NoProfile -ExecutionPolicy Bypass -File $st.script
                }
            }
            $okStep = $true
            $exitCode = 0
        }
        catch {
            $okStep = $false
            $exitCode = if ($LASTEXITCODE -ne $null) { [int]$LASTEXITCODE } else { 1 }
            $errMsg = $_.Exception.Message
        }

        $t1 = Get-Date
        $durMs = Get-DurationMs -Start $t0 -End $t1

        $art = Resolve-Artifacts $st
        $missingReq = @($art | Where-Object { $_.required -and -not $_.exists })
        if ($okStep -and $missingReq.Count -gt 0) {
            $okStep = $false
            $errMsg = "Artifacts requis manquants: " + (($missingReq | ForEach-Object { "$($_.key):$($_.path)" }) -join ", ")
            $exitCode = 2
        }

        $runObj = [pscustomobject]@{
            runStamp  = $runStamp
            repoRoot  = $script:root
            startedAt = $t0.ToString("o")
            endedAt   = $t1.ToString("o")
        }

        $stepMeta = [pscustomobject]@{
            id     = $st.id
            name   = $st.name
            script = $st.rel
            args   = @($st.stepArgs | ForEach-Object { [string]$_ })
            tags   = @($st.tags)
            kind   = $st.kind
        }

        $resObj = [pscustomobject]@{
            ok       = [bool]$okStep
            exitCode = [int]$exitCode
            error    = $errMsg
        }

        $metricsObj = [pscustomobject]@{ durationMs = [int64]$durMs }

        $rep = New-StepReport -SchemaVersion 1 `
            -Run $runObj `
            -Step $stepMeta `
            -Result $resObj `
            -Artifacts ([pscustomobject]@{ expected = @($art) }) `
            -Provides @($st.provides) `
            -Requires @($st.requires) `
            -Metrics $metricsObj `
            -Git $git

        try {
            $paths = Write-StepReportFiles -CiDirs $script:ciDirs -StepId $st.id -ReportObject $rep
        }
        catch {
            throw "Écriture report step '$($st.id)' impossible: $($_.Exception.Message)"
        }

        $script:stepReports.Add([pscustomobject]@{
            id      = $st.id
            ok      = [bool]$okStep
            latest  = $paths.latestRel
            history = $paths.historyRel
        }) | Out-Null

        if ($okStep) {
            foreach ($p in @($st.provides)) { [void]$script:capabilities.Add([string]$p) }
        }

        if (-not $okStep) {
            throw "Step '$($st.id)' KO: $errMsg"
        }
    }

    Ok "CI: OK (toutes les étapes sélectionnées ont passé)."
    exit 0
}
catch {
    Err "CI: KO"
    Err $_.Exception.Message
    exit 1
}
finally {
    # AlwaysCleanup
    if ($AlwaysCleanup.IsPresent -and $didRun) {
        try {
            if ($null -ne $script:cleanupStep) {
                Warn "finally: cleanup-audit (AlwaysCleanup activé)"
                pwsh -NoProfile -ExecutionPolicy Bypass -File $script:cleanupStep.script | Out-Host
            }
            else {
                Warn "finally: aucun step 'cleanup' trouvé dans le manifeste."
            }
        }
        catch {
            Warn ("finally: cleanup a échoué (non bloquant): " + $_.Exception.Message)
        }
    }

    # Run report global (best effort), uniquement si on a réellement exécuté
    if ($didRun -and $null -ne $runStamp -and $null -ne $script:root -and $null -ne $script:ciDirs) {
        try {
            $endedAt = Get-Date
            $durMs = Get-DurationMs -Start $runStartedAt -End $endedAt

            # ✅ FIX IMPORTANT : convertir la List[object] en ARRAY PowerShell
            # (évite ConvertTo-Json qui casse sur certains indexers .NET => "Argument types do not match")
            $stepsForJson = @($script:stepReports | ForEach-Object { $_ })

            $total = $stepsForJson.Count
            $okCount = @($stepsForJson | Where-Object { $_.ok }).Count
            $koCount = $total - $okCount

            $runReport = [ordered]@{
                schemaVersion = 1
                run           = [ordered]@{
                    runStamp   = $runStamp
                    repoRoot   = $script:root
                    startedAt  = $runStartedAt.ToString("o")
                    endedAt    = $endedAt.ToString("o")
                    durationMs = [int64]$durMs
                }
                git           = $git
                summary       = [ordered]@{
                    stepsTotal = $total
                    stepsOk    = $okCount
                    stepsKo    = $koCount
                }
                steps         = $stepsForJson
            }

            [void](Write-RunReportFiles -CiDirs $script:ciDirs -RunReportObject $runReport)
        }
        catch {
            # logs plus utiles si ça re-casse
            Warn ("finally: impossible d'écrire ci-report.json: " + $_.Exception.GetType().FullName + " | " + $_.Exception.Message)
            if ($_.InvocationInfo) {
                Warn ("finally: at " + $_.InvocationInfo.ScriptName + ":" + $_.InvocationInfo.ScriptLineNumber)
                Warn ("finally: line => " + ($_.InvocationInfo.Line.Trim()))
            }
        }
    }
}
