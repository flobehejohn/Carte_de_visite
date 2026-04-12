[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [string]$OutDir = "audit/ci-map",
    [string]$RunStamp = "",
    [switch]$RenderGraph = $true,
    [string]$DotExe = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# --- Fonctions Utilitaires ---

function Ensure-Dir([string]$p) {
    if (-not (Test-Path -LiteralPath $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
}

function Rel([string]$root, [string]$path) {
    $r = (Resolve-Path -LiteralPath $root).Path.TrimEnd('\', '/')
    $p = (Resolve-Path -LiteralPath $path).Path
    if ($p.StartsWith($r, [StringComparison]::OrdinalIgnoreCase)) {
        return $p.Substring($r.Length).TrimStart('\', '/')
    }
    return $p
}

function Read-Text([string]$path) {
    try { return Get-Content -LiteralPath $path -Raw -ErrorAction Stop }
    catch { return "" }
}

function Add-Node([hashtable]$nodes, [string]$id, [string]$label, [string]$kind, [string]$path = "") {
    if (-not $nodes.ContainsKey($id)) {
        $nodes[$id] = [pscustomobject][ordered]@{
            id    = $id
            label = $label
            kind  = $kind
            path  = $path
        }
    }
}

function Add-Edge([System.Collections.Generic.List[object]]$edges, [string]$from, [string]$to, [string]$type) {
    $edges.Add([pscustomobject][ordered]@{ from = $from; to = $to; type = $type }) | Out-Null
}

function Guess-Category([string]$relPath) {
    $p = $relPath -replace '/', '\'
    if ($p -match '^\s*\.github\\workflows\\') { return "workflow" }
    if ($p -match '^\s*scripts\\ci\\') { return "orchestrator" }
    if ($p -match '^\s*scripts\\_lib\\') { return "lib" }
    if ($p -match '^\s*scripts\\diag\\') { return "diag" }
    if ($p -match '^\s*scripts\\smoke\\' -or $p -match 'smoke') { return "smoke" }
    if ($p -match '^\s*scripts\\lint\\' -or $p -match 'lint') { return "lint" }
    if ($p -match 'audit-') { return "audit" }
    if ($p -match 'gate') { return "gate" }
    if ($p -match 'vercel') { return "deploy" }
    if ($p -match '\.megalinter\\presets\\') { return "megalinter-preset" }
    if ($p -match '\.mega-linter\.yml$') { return "megalinter-config" }
    if ($p -match '^package\.json$') { return "npm" }
    if ($p -match '^vercel(\..+)?\.json$') { return "deploy" }
    return "misc"
}

# --- Parsers ---

function Try-Resolve-JoinPath([string]$fileDir, [string]$line) {
    if ($line -match 'Join-Path\s+\$ScriptDir\s+"([^"]+)"') {
        return (Join-Path $fileDir $Matches[1])
    }
    if ($line -match "Join-Path\s+\`$ScriptDir\s+'([^']+)'") {
        return (Join-Path $fileDir $Matches[1])
    }
    return $null
}

function Parse-PwshCalls([string]$text) {
    $targets = @()
    $rx = [regex]::new('(?mi)\bpwsh\b[^\r\n]*?\s-File\s+(?<p>("([^"]+)")|(''([^'']+)'')|([^\s`]+))')
    foreach ($m in $rx.Matches($text)) {
        $raw = $m.Groups['p'].Value.Trim().Trim('"').Trim("'")
        if ($raw) { $targets += $raw }
    }
    $rx2 = [regex]::new('(?mi)^\s*&\s+(?<p>("([^"]+)")|(''([^'']+)'')|(\.\\[^\s`]+))')
    foreach ($m in $rx2.Matches($text)) {
        $raw = $m.Groups['p'].Value.Trim().Trim('"').Trim("'")
        if ($raw) { $targets += $raw }
    }
    return $targets | Select-Object -Unique
}

function Parse-ImportModules([string]$fileDir, [string]$text) {
    $mods = @()
    $rx = [regex]::new('(?mi)^\s*Import-Module\s+(?<p>("([^"]+)")|(''([^'']+)'')|(\.\\[^\s`]+))')
    foreach ($m in $rx.Matches($text)) {
        $raw = $m.Groups['p'].Value.Trim().Trim('"').Trim("'")
        if ($raw -like ".\*") { $mods += $raw }
    }
    $lines = $text -split "`r?`n"
    foreach ($ln in $lines) {
        if ($ln -match '^\s*Import-Module\s+\(Join-Path\s+\$ScriptDir') {
            $p = Try-Resolve-JoinPath -fileDir $fileDir -line $ln
            if ($p) { $mods += $p }
        }
    }
    return $mods | Select-Object -Unique
}

function Parse-NpmScripts([string]$pkgJson) {
    $out = @()
    if (-not (Test-Path -LiteralPath $pkgJson)) { return @() }
    $obj = Get-Content -LiteralPath $pkgJson -Raw | ConvertFrom-Json
    if ($null -eq $obj.scripts) { return @() }
    foreach ($p in $obj.scripts.PSObject.Properties) {
        $out += [pscustomobject][ordered]@{ name = $p.Name; cmd = [string]$p.Value }
    }
    return $out
}

function Parse-WorkflowRuns([string]$yamlText) {
    $runs = @()
    $lines = $yamlText -split "`r?`n"
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $ln = $lines[$i]
        if ($ln -match '^\s*run:\s*(.+)$') {
            $runs += $Matches[1]
        }
    }
    return $runs
}

function Resolve-Dot([string]$explicitPath) {
    if (-not [string]::IsNullOrWhiteSpace($explicitPath)) {
        if (Test-Path -LiteralPath $explicitPath) { return $explicitPath }
    }
    $cmd = Get-Command dot -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $candidates = @(
        "$env:ProgramFiles\Graphviz\bin\dot.exe",
        "${env:ProgramFiles(x86)}\Graphviz\bin\dot.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path -LiteralPath $c) { return $c }
    }
    return $null
}

# ---------------- MAIN ----------------

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
if ([string]::IsNullOrWhiteSpace($RunStamp)) { $RunStamp = ("MAP_{0:yyyyMMdd_HHmmss}" -f (Get-Date)) }

$runDir = Join-Path $RepoRoot (Join-Path $OutDir $RunStamp)
Ensure-Dir $runDir

Write-Host "Cartographie en cours..." -ForegroundColor Cyan
Write-Host "  Repo: $RepoRoot" -ForegroundColor Gray

$nodes = @{}
$edges = New-Object 'System.Collections.Generic.List[object]'

# 1) COLLECTE OPTIMISÉE DES FICHIERS
# On définit les exclusions lourdes pour ne pas scanner node_modules
$excludeDirs = @("node_modules", ".git", ".vercel", ".next", "dist", "coverage", "audit")
$patterns = @(
    ".github/workflows/*.yml",
    ".github/workflows/*.yaml",
    "scripts/**/*.ps1",
    "scripts/**/*.psm1",
    "scripts/**/*.js",
    "scripts/**/*.cjs",
    "scripts/**/*.ts",
    ".megalinter/presets/*.yml",
    ".mega-linter.yml",
    "package.json",
    "vercel.json",
    "vercel.*.json"
)

# On liste tout une seule fois, en filtrant les chemins exclus
Write-Host "  Scan des fichiers (exclusion de node_modules)..." -ForegroundColor Gray
$allFiles = Get-ChildItem -Path $RepoRoot -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
        $p = $_.FullName
        foreach ($ex in $excludeDirs) {
            if ($p -like "*\$ex\*") { return $false }
        }
        return $true
    }

# On filtre maintenant selon les patterns
$files = New-Object 'System.Collections.Generic.List[string]'
foreach ($f in $allFiles) {
    $rel = Rel $RepoRoot $f.FullName
    # Normalisation des slashes pour le match
    $relNorm = $rel -replace '\\', '/'
    foreach ($pat in $patterns) {
        # Conversion du glob simple en wildcard PowerShell
        if ($relNorm -like $pat) {
            $files.Add($f.FullName)
            break
        }
    }
}
$files = $files | Select-Object -Unique
Write-Host "  Fichiers retenus: $($files.Count)" -ForegroundColor Green

# 2) nodes: files
foreach ($f in $files) {
    $rel = Rel $RepoRoot $f
    $cat = Guess-Category $rel
    $id = "file:" + $rel
    Add-Node -nodes $nodes -id $id -label $rel -kind $cat -path $f
}

# 3) package.json scripts
$pkgPath = Join-Path $RepoRoot "package.json"
if (Test-Path -LiteralPath $pkgPath) {
    $pkgNode = "file:package.json"
    foreach ($s in Parse-NpmScripts $pkgPath) {
        $sid = "npm:" + $s.name
        Add-Node -nodes $nodes -id $sid -label ("npm run " + $s.name) -kind "npm-script" -path ""
        Add-Edge -edges $edges -from $pkgNode -to $sid -type "defines"

        $cmd = $s.cmd
        if ($cmd -match '\bvitest\b') { Add-Node $nodes "tool:vitest" "vitest" "tool" ""; Add-Edge $edges $sid "tool:vitest" "uses" }
        if ($cmd -match '\btsc\b') { Add-Node $nodes "tool:tsc" "tsc" "tool" ""; Add-Edge $edges $sid "tool:tsc" "uses" }
        if ($cmd -match '\bvite\b') { Add-Node $nodes "tool:vite" "vite" "tool" ""; Add-Edge $edges $sid "tool:vite" "uses" }
        if ($cmd -match '\beslint\b') { Add-Node $nodes "tool:eslint" "eslint" "tool" ""; Add-Edge $edges $sid "tool:eslint" "uses" }
        if ($cmd -match '\bplaywright\b') { Add-Node $nodes "tool:playwright" "playwright" "tool" ""; Add-Edge $edges $sid "tool:playwright" "uses" }

        foreach ($t in Parse-PwshCalls $cmd) {
            $full = Join-Path $RepoRoot $t
            if (Test-Path -LiteralPath $full) {
                $toRel = Rel $RepoRoot $full
                $toId = "file:" + $toRel
                Add-Edge $edges $sid $toId "calls"
            }
        }
    }
}

# 4) parse scripts
foreach ($f in $files) {
    $rel = Rel $RepoRoot $f
    if ($rel -notmatch '\.(ps1|psm1)$') { continue }

    $fromId = "file:" + $rel
    $dir = Split-Path -Parent $f
    $txt = Read-Text $f
    if (-not $txt) { continue }

    foreach ($p in Parse-ImportModules -fileDir $dir -text $txt) {
        $full = $p
        if ($p -like ".\*") { $full = Join-Path $RepoRoot $p }
        if (Test-Path -LiteralPath $full) {
            $toRel = Rel $RepoRoot $full
            $toId = "file:" + $toRel
            Add-Edge $edges $fromId $toId "imports"
        }
    }

    foreach ($t in Parse-PwshCalls $txt) {
        $full = $t
        if ($t -like ".\*") { $full = Join-Path $RepoRoot $t }
        if (Test-Path -LiteralPath $full) {
            $toRel = Rel $RepoRoot $full
            $toId = "file:" + $toRel
            Add-Edge $edges $fromId $toId "calls"
        }
    }
}

# 5) parse workflows
$wfDir = Join-Path $RepoRoot ".github\workflows"
if (Test-Path -LiteralPath $wfDir) {
    Get-ChildItem -LiteralPath $wfDir -File -ErrorAction SilentlyContinue | ForEach-Object {
        $wf = $_.FullName
        $wfRel = Rel $RepoRoot $wf
        $fromId = "file:" + $wfRel
        $txt = Read-Text $wf
        foreach ($r in Parse-WorkflowRuns $txt) {
            if ($r -match '\bpwsh\b.*-File\s+([^\s`]+)') {
                $p = $Matches[1].Trim().Trim('"').Trim("'")
                $full = Join-Path $RepoRoot $p
                if (Test-Path -LiteralPath $full) {
                    $toRel = Rel $RepoRoot $full
                    Add-Edge $edges $fromId ("file:" + $toRel) "runs"
                }
            }
            if ($r -match '\bnpm\s+run\s+([A-Za-z0-9:\-_]+)') {
                $name = $Matches[1]
                $sid = "npm:" + $name
                if ($nodes.ContainsKey($sid)) { Add-Edge $edges $fromId $sid "runs" }
            }
        }
    }
}

# 6) vercel.json links
$vercel = Join-Path $RepoRoot "vercel.json"
if (Test-Path -LiteralPath $vercel) {
    $vObj = Get-Content -LiteralPath $vercel -Raw | ConvertFrom-Json
    $fromId = "file:vercel.json"
    if ($vObj.buildCommand -and ($vObj.buildCommand -match 'scripts[/\\]([A-Za-z0-9_\-\.]+)')) {
        $candidate = Join-Path $RepoRoot ("scripts\" + $Matches[1])
        if (Test-Path -LiteralPath $candidate) {
            Add-Edge $edges $fromId ("file:" + (Rel $RepoRoot $candidate)) "builds-with"
        }
    }
}

# 7) OUTPUTS
$nodesCsv = Join-Path $runDir "nodes.csv"
$edgesCsv = Join-Path $runDir "edges.csv"
$dotPath = Join-Path $runDir "ci-map.dot"
$svgPath = Join-Path $runDir "ci-map.svg"
$mdPath = Join-Path $runDir "ci-map.md"
$jsonPath = Join-Path $runDir "ci-map.json"

$nodes.Values | Select-Object id, label, kind, path | Export-Csv -LiteralPath $nodesCsv -NoTypeInformation -Encoding UTF8
$edges | Select-Object from, to, type | Export-Csv -LiteralPath $edgesCsv -NoTypeInformation -Encoding UTF8

# DOT
$dot = @()
$dot += "digraph CI {"
$dot += "  rankdir=LR;"
$dot += "  node [shape=box,fontname=""Consolas"",fontsize=10];"

foreach ($n in $nodes.Values) {
    $safeId = $n.id.Replace(':', '_').Replace('\', '_').Replace('/', '_').Replace('.', '_').Replace('-', '_')
    $label = $n.label.Replace('"', '\"')
    $dot += "  $safeId [label=""$label`n($($n.kind))""];"
    $n | Add-Member -NotePropertyName safeId -NotePropertyValue $safeId -Force
}

$map = @{}
foreach ($n in $nodes.Values) { $map[$n.id] = $n.safeId }

foreach ($e in $edges) {
    if (-not $map.ContainsKey($e.from)) { continue }
    if (-not $map.ContainsKey($e.to)) { continue }
    $dot += "  $($map[$e.from]) -> $($map[$e.to]) [label=""$($e.type)"" fontsize=9];"
}
$dot += "}"
Set-Content -LiteralPath $dotPath -Value ($dot -join "`r`n") -Encoding UTF8

# Markdown
$byKind = $nodes.Values | Group-Object -Property { $_.kind } | Sort-Object Count -Descending
$lines = @()
$lines += "# CI Map"
$lines += ""
$lines += "- RepoRoot: $RepoRoot"
$lines += "- RunStamp: $RunStamp"
$lines += "- Nodes: $($nodes.Count)"
$lines += "- Edges: $($edges.Count)"
$lines += ""
$lines += "## Nodes by kind"
$lines += ""
foreach ($g in $byKind) { $lines += ("- {0}: {1}" -f $g.Name, $g.Count) }
Set-Content -LiteralPath $mdPath -Value ($lines -join "`r`n") -Encoding UTF8

# JSON
$payload = [ordered]@{
    runStamp = $RunStamp
    repoRoot = $RepoRoot
    nodes    = $nodes.Values
    edges    = $edges
}
$payload | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

# GRAPHVIZ RENDER
if ($RenderGraph) {
    $dotBin = Resolve-Dot -explicitPath $DotExe
    if ($dotBin) {
        Write-Host "Rendu Graphviz avec: $dotBin" -ForegroundColor Cyan
        try {
            & $dotBin -Tsvg $dotPath -o $svgPath
            if (Test-Path -LiteralPath $svgPath) {
                Write-Host "SUCCÈS: SVG généré dans $svgPath" -ForegroundColor Green
            }
        } catch {
            Write-Warning "Erreur Graphviz: $_"
        }
    } else {
        Write-Warning "Graphviz 'dot' introuvable."
    }
}

Write-Host "TERMINÉ: $runDir" -ForegroundColor Green
