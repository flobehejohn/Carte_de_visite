Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Normalize-Rel([string]$p) {
    if ([string]::IsNullOrWhiteSpace($p)) { return $p }
    return ($p -replace "\\", "/").TrimStart("./")
}

function Get-MadgeBin([string]$RepoRoot) {
    $c1 = Join-Path $RepoRoot "node_modules\.bin\madge.cmd"
    $c2 = Join-Path $RepoRoot "node_modules\.bin\madge"
    if (Test-Path -LiteralPath $c1) { return $c1 }
    if (Test-Path -LiteralPath $c2) { return $c2 }
    return $null
}

function Try-RunMadgeJson {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [string]$EntryDir = "src",
        [string]$TsConfigPath = "tsconfig.json"
    )

    $RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
    $madgeBin = Get-MadgeBin $RepoRoot

    Push-Location $RepoRoot
    try {
        $args = @($EntryDir, "--extensions", "ts,tsx,js,jsx", "--json")

        $tsCfgAbs = Join-Path $RepoRoot $TsConfigPath
        if (Test-Path -LiteralPath $tsCfgAbs) {
            # madge supporte --ts-config dans l’usage courant TS/React
            $args += @("--ts-config", $TsConfigPath)
        }

        $raw = $null
        if ($madgeBin) {
            $raw = & $madgeBin @args 2>$null
        }
        else {
            # fallback (ne télécharge pas): si madge n’est pas dans node_modules, ça échoue => on fallback regex
            $raw = & npx --no-install madge @args 2>$null
        }

        if ($LASTEXITCODE -ne 0) { return $null }

        $txt = ($raw -join "`n").Trim()
        if ([string]::IsNullOrWhiteSpace($txt)) { return $null }
        if ($txt -eq "null") { return $null }

        return ($txt | ConvertFrom-Json)
    }
    finally { Pop-Location }
}

function Build-GraphFromAdjacency {
    param(
        [Parameter(Mandatory)]$Adj,
        [string]$KeepPrefix = "src/"
    )

    $nodes = New-Object System.Collections.Generic.HashSet[string]
    $edges = New-Object System.Collections.Generic.List[object]
    $adjOut = @{}
    $rev = @{}

    foreach ($prop in $Adj.PSObject.Properties) {
        $from = Normalize-Rel $prop.Name
        if (-not $from.StartsWith($KeepPrefix)) { continue }

        $null = $nodes.Add($from)
        if (-not $adjOut.ContainsKey($from)) { $adjOut[$from] = @() }

        foreach ($d in @($prop.Value)) {
            $to = Normalize-Rel ([string]$d)
            if (-not $to.StartsWith($KeepPrefix)) { continue }

            $null = $nodes.Add($to)
            $adjOut[$from] += $to

            if (-not $rev.ContainsKey($to)) { $rev[$to] = @() }
            $rev[$to] += $from

            $edges.Add([pscustomobject]@{ from = $from; to = $to }) | Out-Null
        }
    }

    foreach ($n in $nodes) {
        if (-not $adjOut.ContainsKey($n)) { $adjOut[$n] = @() }
        if (-not $rev.ContainsKey($n)) { $rev[$n] = @() }
    }

    return [pscustomobject]@{
        tool      = "madge"
        nodes     = @($nodes)
        edges     = @($edges)
        adjacency = $adjOut
        reverse   = $rev
    }
}

function Get-LintImportGraph {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [string]$EntryDir = "src",
        [string]$TsConfigPath = "tsconfig.json",
        [string]$KeepPrefix = "src/"
    )

    $adj = Try-RunMadgeJson -RepoRoot $RepoRoot -EntryDir $EntryDir -TsConfigPath $TsConfigPath
    if ($null -eq $adj) {
        return [pscustomobject]@{
            tool      = "none"
            nodes     = @()
            edges     = @()
            adjacency = @{}
            reverse   = @{}
        }
    }

    return (Build-GraphFromAdjacency -Adj $adj -KeepPrefix $KeepPrefix)
}

Export-ModuleMember -Function Get-LintImportGraph
