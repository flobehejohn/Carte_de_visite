Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ----------------------------
# Utils
# ----------------------------
function Ensure-Dir {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
    (Resolve-Path -LiteralPath $Path).Path
}

function Normalize-Rel([string]$p) {
    if ([string]::IsNullOrWhiteSpace($p)) { return $p }
    return ($p -replace "\\", "/").TrimStart("./")
}

function Normalize-RepoRel {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string]$Path
    )

    $repo = (Resolve-Path -LiteralPath $RepoRoot).Path
    $abs = $Path
    if ([System.IO.Path]::IsPathRooted($abs)) {
        $abs = (Resolve-Path -LiteralPath $abs).Path
        if ($abs.StartsWith($repo, [System.StringComparison]::OrdinalIgnoreCase)) {
            $abs = $abs.Substring($repo.Length).TrimStart('\', '/')
        }
    }
    Normalize-Rel $abs
}

function Try-GetPropValue([object]$Obj, [string]$Name) {
    if ($null -eq $Obj) { return $null }
    $p = $Obj.PSObject.Properties[$Name]
    if ($null -ne $p) { return $p.Value }
    return $null
}

function New-Stamp { (Get-Date).ToString("yyyyMMdd_HHmmss") }

# ----------------------------
# FamilyMap (lint.families.json)
# ----------------------------
function Get-LintFamilyMap {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) { throw "FamilyMap introuvable: $Path" }

    $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    $obj = $raw | ConvertFrom-Json
    if (-not $obj) { throw "FamilyMap invalide: $Path" }

    $d = Try-GetPropValue $obj "defaults"
    $defaults = [pscustomobject]@{
        familyId        = "other"
        familyWeight    = 1.0
        severityWeights = [pscustomobject]@{ "1" = 1.0; "2" = 3.0 }
        fixDiscount     = 0.25
        interdepBoost   = 1.5
        successScale    = 250.0
    }
    if ($null -ne $d) {
        $v = Try-GetPropValue $d "familyId"        ; if ($v) { $defaults.familyId = [string]$v }
        $v = Try-GetPropValue $d "familyWeight"    ; if ($null -ne $v) { $defaults.familyWeight = [double]$v }
        $v = Try-GetPropValue $d "fixDiscount"     ; if ($null -ne $v) { $defaults.fixDiscount = [double]$v }
        $v = Try-GetPropValue $d "interdepBoost"   ; if ($null -ne $v) { $defaults.interdepBoost = [double]$v }
        $v = Try-GetPropValue $d "successScale"    ; if ($null -ne $v) { $defaults.successScale = [double]$v }

        $sw = Try-GetPropValue $d "severityWeights"
        if ($null -ne $sw) { $defaults.severityWeights = $sw }
    }

    $familiesRaw = Try-GetPropValue $obj "families"
    $families = @()
    if ($null -ne $familiesRaw) { $families = @($familiesRaw) }

    if (-not ($families | Where-Object { [string]$_.id -eq "other" })) {
        $families += [pscustomobject]@{ id = "other"; title = "Autres"; weight = 1.0; prefixes = @(); rules = @() }
    }

    $familyById = @{}
    $familyWeights = @{}
    $exactRules = @{}
    $prefixesIdx = @()

    foreach ($f in $families) {
        $id = [string](Try-GetPropValue $f "id")
        if ([string]::IsNullOrWhiteSpace($id)) { continue }

        $title = [string](Try-GetPropValue $f "title")
        if ([string]::IsNullOrWhiteSpace($title)) { $title = $id }

        $weight = Try-GetPropValue $f "weight"
        if ($null -eq $weight) { $weight = $defaults.familyWeight }

        $prefixes = @()
        $pr = Try-GetPropValue $f "prefixes"
        if ($null -ne $pr) { $prefixes = @($pr) }

        $rules = @()
        $rr = Try-GetPropValue $f "rules"
        if ($null -ne $rr) { $rules = @($rr) }

        $famObj = [pscustomobject]@{
            id       = $id
            title    = $title
            weight   = [double]$weight
            prefixes = @($prefixes | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
            rules    = @($rules    | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
        }

        $familyById[$id] = $famObj
        $familyWeights[$id] = [double]$famObj.weight

        foreach ($r in @($famObj.rules)) {
            if (-not $exactRules.ContainsKey($r)) { $exactRules[$r] = $id }
        }
        foreach ($p in @($famObj.prefixes)) {
            $prefixesIdx += [pscustomobject]@{ prefix = [string]$p; familyId = $id }
        }
    }

    $prefixesIdx = $prefixesIdx | Sort-Object { $_.prefix.Length } -Descending

    $ruleOverrides = @{}
    $roRaw = Try-GetPropValue $obj "ruleOverrides"
    if ($null -ne $roRaw) {
        foreach ($prop in $roRaw.PSObject.Properties) {
            $ruleId = [string]$prop.Name
            $o = $prop.Value
            $familyId = [string](Try-GetPropValue $o "familyId")
            $w = Try-GetPropValue $o "weight"
            $ruleOverrides[$ruleId] = [pscustomobject]@{
                familyId = $familyId
                weight   = $(if ($null -ne $w) { [double]$w } else { $null })
            }
        }
    }

    [pscustomobject]@{
        version       = Try-GetPropValue $obj "version"
        defaults      = $defaults
        families      = $familyById
        familyWeights = $familyWeights
        exactRules    = $exactRules
        prefixesIdx   = $prefixesIdx
        ruleOverrides = $ruleOverrides
    }
}

function Resolve-FamilyForRule {
    param(
        [AllowNull()][string]$RuleId,
        [Parameter(Mandatory)][object]$FamilyMap
    )
    if ([string]::IsNullOrWhiteSpace($RuleId)) { return $FamilyMap.defaults.familyId }

    if ($FamilyMap.ruleOverrides.ContainsKey($RuleId)) {
        $fo = [string]$FamilyMap.ruleOverrides[$RuleId].familyId
        if (-not [string]::IsNullOrWhiteSpace($fo)) { return $fo }
    }

    if ($FamilyMap.exactRules.ContainsKey($RuleId)) { return [string]$FamilyMap.exactRules[$RuleId] }

    foreach ($p in @($FamilyMap.prefixesIdx)) {
        if ($RuleId.StartsWith($p.prefix)) { return [string]$p.familyId }
    }
    return $FamilyMap.defaults.familyId
}

function Resolve-WeightForRule {
    param(
        [AllowNull()][string]$RuleId,
        [Parameter(Mandatory)][string]$FamilyId,
        [Parameter(Mandatory)][object]$FamilyMap
    )

    if (-not [string]::IsNullOrWhiteSpace($RuleId) -and $FamilyMap.ruleOverrides.ContainsKey($RuleId)) {
        $w = $FamilyMap.ruleOverrides[$RuleId].weight
        if ($null -ne $w) { return [double]$w }
    }

    if ($FamilyMap.familyWeights.ContainsKey($FamilyId)) { return [double]$FamilyMap.familyWeights[$FamilyId] }
    return [double]$FamilyMap.defaults.familyWeight
}

function Resolve-SeverityWeight {
    param([int]$Severity, [Parameter(Mandatory)][object]$FamilyMap)
    $sw = $FamilyMap.defaults.severityWeights
    $k = "$Severity"
    if ($null -ne $sw -and ($sw.PSObject.Properties.Name -contains $k)) {
        return [double]($sw.$k)
    }
    return 1.0
}

# ----------------------------
# ESLint runner + parser
# ----------------------------
function Invoke-EslintJson {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string]$OutJson,
        [Parameter(Mandatory)][string[]]$Targets,
        [switch]$FixDryRun
    )

    $RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
    Ensure-Dir (Split-Path -Parent $OutJson) | Out-Null

    $args = @("eslint", "--format", "json", "--output-file", $OutJson, "--no-error-on-unmatched-pattern")
    if ($FixDryRun) { $args += "--fix-dry-run" }
    $args += $Targets

    Push-Location $RepoRoot
    try {
        & npx @args | Out-Null
        return [int]$LASTEXITCODE
    }
    finally { Pop-Location }
}

function ConvertFrom-EslintJson {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string]$JsonPath,
        [Parameter(Mandatory)][object]$FamilyMap
    )

    $raw = Get-Content -LiteralPath $JsonPath -Raw -Encoding UTF8
    $data = $raw | ConvertFrom-Json

    $results = $null
    if ($data -is [System.Array]) { $results = $data }
    elseif ($null -ne (Try-GetPropValue $data "results")) { $results = $data.results }
    else { throw "Format eslint.json inconnu (array ou {results:[]})" }

    $msgs = New-Object System.Collections.Generic.List[object]

    foreach ($r in @($results)) {
        $fileAbs = [string](Try-GetPropValue $r "filePath")
        if ([string]::IsNullOrWhiteSpace($fileAbs)) { continue }

        $fileRel = Normalize-RepoRel -RepoRoot $RepoRoot -Path $fileAbs
        $messages = Try-GetPropValue $r "messages"
        if ($null -eq $messages) { continue }

        foreach ($m in @($messages)) {
            $sevRaw = Try-GetPropValue $m "severity"
            $sev = 0
            if ($null -ne $sevRaw) { $sev = [int]$sevRaw }

            $ruleId = [string](Try-GetPropValue $m "ruleId")
            $familyId = Resolve-FamilyForRule -RuleId $ruleId -FamilyMap $FamilyMap
            $familyTitle = $familyId
            if ($FamilyMap.families.ContainsKey($familyId)) { $familyTitle = [string]$FamilyMap.families[$familyId].title }

            $fixable = $false
            if ($null -ne (Try-GetPropValue $m "fix")) { $fixable = $true }
            $sugs = Try-GetPropValue $m "suggestions"
            if ($null -ne $sugs -and @($sugs).Count -gt 0) { $fixable = $true }

            $line = 0
            $lv = Try-GetPropValue $m "line"
            if ($null -ne $lv) { $line = [int]$lv }

            $col = 0
            $cv = Try-GetPropValue $m "column"
            if ($null -ne $cv) { $col = [int]$cv }

            $sevW = Resolve-SeverityWeight -Severity $sev -FamilyMap $FamilyMap
            $ruleW = Resolve-WeightForRule -RuleId $ruleId -FamilyId $familyId -FamilyMap $FamilyMap

            $score = $sevW * $ruleW
            $disc = [double]$FamilyMap.defaults.fixDiscount
            if ($fixable -and $disc -gt 0 -and $disc -lt 1) { $score = $score * (1.0 - $disc) }

            $msgs.Add([pscustomobject]@{
                    severity    = $sev
                    severityW   = $sevW
                    ruleId      = $ruleId
                    familyId    = $familyId
                    familyTitle = $familyTitle
                    weight      = $ruleW
                    fixable     = [bool]$fixable
                    score       = [double]$score
                    filePath    = $fileRel
                    line        = $line
                    column      = $col
                    message     = [string](Try-GetPropValue $m "message")
                }) | Out-Null
        }
    }

    @($msgs)
}

# ----------------------------
# Import graph (madge) - optional
# ----------------------------
function Get-MadgeBin([string]$RepoRoot) {
    $c1 = Join-Path $RepoRoot "node_modules\.bin\madge.cmd"
    $c2 = Join-Path $RepoRoot "node_modules\.bin\madge"
    if (Test-Path -LiteralPath $c1) { return $c1 }
    if (Test-Path -LiteralPath $c2) { return $c2 }
    return $null
}

function Try-GetImportAdjacency {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [string]$RootFolder = "src",
        [string]$KeepPrefix = "src/"
    )

    $RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
    $madge = Get-MadgeBin $RepoRoot
    if ($null -eq $madge) { return $null }

    $tmp = Join-Path $env:TEMP ("madge_{0}.json" -f (New-Stamp))
    $args = @("--json", "--extensions", "ts,tsx,js,jsx", $RootFolder)

    $tsc = Join-Path $RepoRoot "tsconfig.json"
    if (Test-Path -LiteralPath $tsc) { $args = @("--ts-config", "tsconfig.json") + $args }

    Push-Location $RepoRoot
    try {
        & $madge @args | Out-File -FilePath $tmp -Encoding UTF8
        if ($LASTEXITCODE -ne 0) { return $null }

        $txt = Get-Content -LiteralPath $tmp -Raw -Encoding UTF8
        if ([string]::IsNullOrWhiteSpace($txt)) { return $null }

        $adj = $txt | ConvertFrom-Json

        $out = @{}
        foreach ($p in $adj.PSObject.Properties) {
            $k = Normalize-Rel $p.Name
            if (-not $k.StartsWith($KeepPrefix)) { continue }
            $vals = @($p.Value) | ForEach-Object { Normalize-Rel ([string]$_) } | Where-Object { $_.StartsWith($KeepPrefix) }
            $out[$k] = $vals
        }
        return $out
    }
    finally {
        Pop-Location
        Remove-Item -Force -LiteralPath $tmp -ErrorAction SilentlyContinue
    }
}

function Build-ReverseAdjacency($Adj) {
    $rev = @{}
    foreach ($from in $Adj.Keys) {
        foreach ($to in @($Adj[$from])) {
            if (-not $rev.ContainsKey($to)) { $rev[$to] = New-Object System.Collections.Generic.List[string] }
            $rev[$to].Add($from) | Out-Null
        }
    }
    $rev
}

# ----------------------------
# Report HTML
# ----------------------------
function Write-ReportHtml {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][object]$Summary,
        [Parameter(Mandatory)][object[]]$FamilyRows,
        [Parameter(Mandatory)][object[]]$TopFiles
    )

    $dataJson = ([pscustomobject]@{
            summary  = $Summary
            families = $FamilyRows
            topFiles = $TopFiles
        } | ConvertTo-Json -Depth 12)

    $html = @'
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Lint Analytics</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:20px;color:#111}
  .grid{display:grid;grid-template-columns:repeat(12,1fr);gap:16px}
  .card{border:1px solid #ddd;border-radius:12px;padding:14px;background:#fff}
  .span6{grid-column:span 6}
  .span4{grid-column:span 4}
  .span8{grid-column:span 8}
  .span12{grid-column:span 12}
  .kpi{display:flex;gap:14px;flex-wrap:wrap}
  .kpi > div{min-width:120px}
  h1{margin:0 0 8px 0;font-size:20px}
  h2{margin:0 0 10px 0;font-size:14px;color:#444}
  canvas{max-width:100%}
  table{width:100%;border-collapse:collapse}
  td,th{border-bottom:1px solid #eee;padding:6px 4px;font-size:12px;text-align:left}
  .muted{color:#666}
</style>
</head>
<body>
<h1>Lint Analytics</h1>
<p class="muted">Report local offline — basé sur ESLint JSON + pondérations (families).</p>

<div class="grid">
  <div class="card span8">
    <h2>KPI</h2>
    <div class="kpi" id="kpis"></div>
  </div>
  <div class="card span4">
    <h2>Probabilité de réussite</h2>
    <canvas id="donut" width="240" height="160"></canvas>
  </div>

  <div class="card span6">
    <h2>Camembert — score par famille</h2>
    <canvas id="pie" width="320" height="220"></canvas>
  </div>
  <div class="card span6">
    <h2>Courbe — mapping Score → Probabilité</h2>
    <canvas id="curve" width="420" height="220"></canvas>
  </div>

  <div class="card span12">
    <h2>Top fichiers risqués (impactScore)</h2>
    <table>
      <thead><tr><th>Fichier</th><th>Errors</th><th>Warns</th><th>Fixable</th><th>Score</th><th>Dep</th><th>Impact</th></tr></thead>
      <tbody id="topfiles"></tbody>
    </table>
  </div>
</div>

<script>
const DATA = __DATA__;

function fmt(n){ return (Math.round(n*100)/100).toString(); }

function drawDonut(ctx, p){
  const w=ctx.canvas.width,h=ctx.canvas.height;
  ctx.clearRect(0,0,w,h);
  const cx=w/2, cy=h/2+10, r=Math.min(w,h)*0.33;
  const a0=-Math.PI/2, a1=a0 + (Math.PI*2)*p;

  ctx.lineWidth=14;
  ctx.strokeStyle="#eee";
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();

  ctx.strokeStyle="#111";
  ctx.beginPath(); ctx.arc(cx,cy,r,a0,a1); ctx.stroke();

  ctx.fillStyle="#111";
  ctx.font="16px system-ui";
  ctx.textAlign="center";
  ctx.fillText(Math.round(p*100)+"%", cx, cy+6);

  ctx.font="12px system-ui";
  ctx.fillStyle="#666";
  ctx.fillText("P(release)", cx, cy-18);
}

function drawPie(ctx, rows){
  const w=ctx.canvas.width,h=ctx.canvas.height;
  ctx.clearRect(0,0,w,h);
  const cx=110,cy=h/2,r=80;
  const total = rows.reduce((s,r)=>s+r.score,0) || 1;

  let a=-Math.PI/2;
  rows.forEach((row,i)=>{
    const frac=row.score/total;
    const a2=a+frac*Math.PI*2;
    ctx.fillStyle = "hsl(" + ((i*50)%360) + ",60%,55%)";
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,r,a,a2);
    ctx.closePath();
    ctx.fill();
    a=a2;
  });

  ctx.font="12px system-ui";
  ctx.fillStyle="#111";
  let y=18, x=220;
  rows.slice(0,7).forEach((row,i)=>{
    ctx.fillStyle="hsl(" + ((i*50)%360) + ",60%,55%)";
    ctx.fillRect(x,y-10,10,10);
    ctx.fillStyle="#111";
    ctx.fillText(row.familyTitle + " (" + fmt(row.score) + ")", x+14, y);
    y+=18;
  });
}

function drawCurve(ctx, scale, currentImpact){
  const w=ctx.canvas.width,h=ctx.canvas.height;
  ctx.clearRect(0,0,w,h);

  ctx.strokeStyle="#ddd";
  ctx.beginPath(); ctx.moveTo(40,10); ctx.lineTo(40,h-30); ctx.lineTo(w-10,h-30); ctx.stroke();

  function P(x){ return Math.exp(-x/scale); }

  ctx.strokeStyle="#111";
  ctx.beginPath();
  for(let i=0;i<=200;i++){
    const x=i/200*(w-60);
    const s=i/200*(scale*3);
    const p=P(s);
    const px=40+x;
    const py=10+(1-p)*(h-50);
    if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
  }
  ctx.stroke();

  const pCur = P(currentImpact);
  const xCur = Math.min(currentImpact/(scale*3),1)*(w-60);
  const yCur = (1-pCur)*(h-50);
  ctx.fillStyle="#111";
  ctx.beginPath(); ctx.arc(40+xCur,10+yCur,4,0,Math.PI*2); ctx.fill();

  ctx.fillStyle="#666";
  ctx.font="12px system-ui";
  ctx.fillText("impact=" + fmt(currentImpact), 46, 18);
  ctx.fillText("scale=" + fmt(scale), 46, 34);
}

function render(){
  const s = DATA.summary;

  const k = document.getElementById("kpis");
  const items = [
    ["Files", s.totals.files],
    ["Messages", s.totals.messages],
    ["Errors", s.totals.errors],
    ["Warnings", s.totals.warns],
    ["Fixables", s.totals.fixable],
    ["Score", s.score.total],
    ["Impact", s.score.impactTotal],
    ["ESLint exit", s.eslint.exitCode],
  ];
  k.innerHTML = items.map(function(pair){
    const a=pair[0], b=pair[1];
    return '<div><div class="muted">'+a+'</div><div><b>'+b+'</b></div></div>';
  }).join("");

  drawDonut(document.getElementById("donut").getContext("2d"), s.score.successProbability);
  drawPie(document.getElementById("pie").getContext("2d"), DATA.families);
  drawCurve(document.getElementById("curve").getContext("2d"), s.score.successScale, s.score.impactTotal);

  const tb = document.getElementById("topfiles");
  tb.innerHTML = DATA.topFiles.map(function(r){
    return (
      "<tr>"+
      "<td>"+r.filePath+"</td>"+
      "<td>"+r.errors+"</td>"+
      "<td>"+r.warns+"</td>"+
      "<td>"+r.fixable+"</td>"+
      "<td>"+fmt(r.score)+"</td>"+
      "<td>"+r.depDegree+"</td>"+
      "<td><b>"+fmt(r.impactScore)+"</b></td>"+
      "</tr>"
    );
  }).join("");
}
render();
</script>
</body>
</html>
'@

    $html = $html.Replace("__DATA__", $dataJson)
    Set-Content -LiteralPath $Path -Value $html -Encoding UTF8
}

# ----------------------------
# Main entry: Invoke-LintAnalytics
# ----------------------------
function Invoke-LintAnalytics {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string]$OutDir,
        [string]$FamilyMapPath = "scripts/lint/lint.families.json",
        [string[]]$Targets = @("src/**/*.{ts,tsx,js,jsx}"),
        [switch]$FixDryRun,
        [switch]$WithImportGraph
    )

    $RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
    $OutDir = Ensure-Dir $OutDir

    $mapPathAbs = Join-Path $RepoRoot $FamilyMapPath
    $fm = Get-LintFamilyMap -Path $mapPathAbs

    $eslintJson = Join-Path $OutDir "eslint.json"
    $exit = Invoke-EslintJson -RepoRoot $RepoRoot -OutJson $eslintJson -Targets $Targets -FixDryRun:$FixDryRun

    # eslint: 0 ok, 1 lint errors (ok pour analytics), 2+ = crash/config
    if ($exit -ge 2) { throw "ESLint a échoué (exit=$exit). Vérifie config / parser / plugins." }

    $messages = ConvertFrom-EslintJson -RepoRoot $RepoRoot -JsonPath $eslintJson -FamilyMap $fm

    $adj = $null
    $rev = $null
    if ($WithImportGraph) {
        $adj = Try-GetImportAdjacency -RepoRoot $RepoRoot
        if ($null -ne $adj) { $rev = Build-ReverseAdjacency $adj }
    }

    # Aggregate by file
    $byFile = $messages | Group-Object filePath
    $fileRows = foreach ($g in $byFile) {
        $errs = @($g.Group | Where-Object severity -eq 2).Count
        $wrns = @($g.Group | Where-Object severity -eq 1).Count
        $fix = @($g.Group | Where-Object fixable).Count
        $score = [double](@($g.Group | Measure-Object score -Sum).Sum)

        $inD = 0; $outD = 0
        if ($null -ne $adj) {
            $outD = if ($adj.ContainsKey($g.Name)) { @($adj[$g.Name]).Count } else { 0 }
            $inD = if ($rev.ContainsKey($g.Name)) { @($rev[$g.Name]).Count } else { 0 }
        }
        $dep = $inD + $outD
        $impact = $score + ($dep * [double]$fm.defaults.interdepBoost)

        $famTop = $g.Group | Group-Object familyTitle | ForEach-Object {
            [pscustomobject]@{ name = $_.Name; score = [double](@($_.Group | Measure-Object score -Sum).Sum) }
        }
        $famTop = @($famTop | Sort-Object score -Descending | Select-Object -First 3)
        $topFamilies = ($famTop | ForEach-Object { "$($_.name):$([math]::Round($_.score,2))" }) -join " | "

        [pscustomobject]@{
            filePath    = $g.Name
            messages    = $g.Count
            errors      = $errs
            warns       = $wrns
            fixable     = $fix
            score       = [math]::Round($score, 6)
            inDegree    = $inD
            outDegree   = $outD
            depDegree   = $dep
            impactScore = [math]::Round($impact, 6)
            topFamilies = $topFamilies
        }
    }
    $fileRows = @($fileRows | Sort-Object impactScore -Descending)

    # Families aggregation
    $famRows = $messages | Group-Object familyId | ForEach-Object {
        $fid = $_.Name
        $title = $fid
        if ($fm.families.ContainsKey($fid)) { $title = [string]$fm.families[$fid].title }
        $score = [double](@($_.Group | Measure-Object score -Sum).Sum)
        $errs = @($_.Group | Where-Object severity -eq 2).Count
        $wrns = @($_.Group | Where-Object severity -eq 1).Count
        [pscustomobject]@{
            familyId    = $fid
            familyTitle = $title
            messages    = $_.Count
            errors      = $errs
            warns       = $wrns
            score       = [math]::Round($score, 6)
        }
    }
    $famRows = @($famRows | Sort-Object score -Descending)

    # Rule aggregation (top 50)
    $ruleRows = $messages | Where-Object { -not [string]::IsNullOrWhiteSpace($_.ruleId) } | Group-Object ruleId | ForEach-Object {
        $score = [double](@($_.Group | Measure-Object score -Sum).Sum)
        [pscustomobject]@{
            ruleId   = $_.Name
            messages = $_.Count
            score    = [math]::Round($score, 6)
        }
    }
    $ruleRows = @($ruleRows | Sort-Object score -Descending | Select-Object -First 50)

    $totFiles = @($fileRows).Count
    $totMsgs = @($messages).Count
    $totErrs = @($messages | Where-Object severity -eq 2).Count
    $totWrns = @($messages | Where-Object severity -eq 1).Count
    $totFix = @($messages | Where-Object fixable).Count

    $totalScore = [double](@($messages | Measure-Object score -Sum).Sum)
    $impactTotal = [double](@($fileRows | Measure-Object impactScore -Sum).Sum)

    $scale = [double]$fm.defaults.successScale
    if ($scale -le 0) { $scale = 250.0 }
    $p = [math]::Exp(- $impactTotal / $scale)
    if ($p -lt 0) { $p = 0 }
    if ($p -gt 1) { $p = 1 }

    $summary = [pscustomobject]@{
        stamp  = New-Stamp
        eslint = [pscustomobject]@{ exitCode = $exit; json = "eslint.json" }
        totals = [pscustomobject]@{
            files    = $totFiles
            messages = $totMsgs
            errors   = $totErrs
            warns    = $totWrns
            fixable  = $totFix
        }
        score  = [pscustomobject]@{
            total              = [math]::Round($totalScore, 6)
            impactTotal        = [math]::Round($impactTotal, 6)
            successScale       = [math]::Round($scale, 6)
            successProbability = [math]::Round($p, 6)
            interdepBoost      = [double]$fm.defaults.interdepBoost
            fixDiscount        = [double]$fm.defaults.fixDiscount
            severityWeights    = $fm.defaults.severityWeights
        }
        notes  = @("successProbability est un indicateur synthétique: P=exp(-impactTotal/successScale).")
    }

    Set-Content -LiteralPath (Join-Path $OutDir "summary.json") -Value ($summary | ConvertTo-Json -Depth 12) -Encoding UTF8
    $fileRows | Export-Csv -NoTypeInformation -Encoding UTF8 -LiteralPath (Join-Path $OutDir "files.csv")
    $famRows  | Export-Csv -NoTypeInformation -Encoding UTF8 -LiteralPath (Join-Path $OutDir "families.csv")
    $ruleRows | Export-Csv -NoTypeInformation -Encoding UTF8 -LiteralPath (Join-Path $OutDir "rules_top50.csv")

    $top = @($fileRows | Select-Object -First 15)
    Write-ReportHtml -Path (Join-Path $OutDir "report.html") -Summary $summary -FamilyRows @($famRows) -TopFiles $top

    [pscustomobject]@{
        summary  = $summary
        files    = $fileRows
        families = $famRows
        rulesTop = $ruleRows
        outDir   = $OutDir
    }
}

Export-ModuleMember -Function @(
    "Get-LintFamilyMap",
    "Invoke-LintAnalytics"
)
