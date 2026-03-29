<#
scripts/diag/vercel-e2e.ps1

E2E Vercel check (robuste):
- appelle curl (direct) sur une route d'un déploiement
- bypass Deployment Protection via header x-vercel-protection-bypass (si présent)
- extrait HTTP status + JSON malgré stdout pollué (logs, texte avant/après, multi-lignes, plusieurs objets)
- fallback Node déterministe si parsing PS échoue
- certifie: http_status_2xx, json_parse_ok, citations_min, corpus_loaded, has_zarat
- écrit des artefacts TOUJOURS (même sur exception)

Artefacts:
- audit/ci/runs/<stamp>/raw.txt
- audit/ci/runs/<stamp>/summary.json
- audit/ci/runs/<stamp>/response.json (si parse OK)
- audit/ci/runs/<stamp>/run.log
- audit/_latest/smoke/latest.txt (pointeur -> summary.json, écrit sans newline, UTF-8 no BOM)

Paramètres:
-DeployUrl : URL de déploiement (avec ou sans https://)
-ApiPath   : /api/...
-Policy    : warn => exit 2 si KO ; block => exit 1 si KO
-MinCitations : nombre minimal de citations
-SelfTest  : test offline anti-régression parsing + node fallback + artefacts
#>

[CmdletBinding()]
param(
    [string]$RepoRoot = ".",
    [string]$DeployUrl = "",
    [string]$ApiPath = "/api/gemini",
    [string]$Prompt = "E2E smoke",
    [ValidateSet("warn", "block")]
    [string]$Policy = "warn",
    [int]$MinCitations = 2,
    [int]$TimeoutSec = 30,
    [switch]$SelfTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function New-Stamp { ("DBG_{0:yyyyMMdd_HHmmss}" -f (Get-Date)) }

function Ensure-Dir([string]$p) {
    if (-not (Test-Path -LiteralPath $p)) { New-Item -ItemType Directory -Path $p | Out-Null }
}

function Write-Utf8NoBom([string]$path, [string]$content) {
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($path, ($content ?? ""), $enc)
}

function Write-JsonNoBom([string]$path, $obj, [int]$depth = 30) {
    $json = ($obj | ConvertTo-Json -Depth $depth)
    Write-Utf8NoBom $path $json
}

function As-String($v) {
    if ($null -eq $v) { return $null }
    if ($v -is [string]) { return $v }
    return ($v | Out-String)
}

function Trunc($s, [int]$max = 4000) {
    $x = As-String $s
    if ($null -eq $x) { return $null }
    if ($x.Length -le $max) { return $x }
    return ($x.Substring(0, $max) + "...(truncated)")
}

function Strip-Ansi([string]$text) {
    if ($null -eq $text) { return $null }
    $t = [regex]::Replace($text, "`e\[[0-9;]*[A-Za-z]", "")
    $t = [regex]::Replace($t, "`e\][^`a]*`a", "")
    return $t
}

function Normalize-DeployUrl([string]$u) {
    $x = (($u ?? "")).Trim().TrimEnd("/")
    if ($x -eq "") { return "" }
    if ($x -notmatch '^https?://') { $x = "https://$x" }
    return $x
}

function Get-PropValue($obj, [string]$name) {
    if ($null -eq $obj) { return $null }
    if ($obj -is [hashtable]) {
        if ($obj.ContainsKey($name)) { return $obj[$name] }
    }
    $p = $obj.PSObject.Properties[$name]
    if ($null -eq $p) { return $null }
    return $p.Value
}

function Redact([string]$s) {
    if ($null -eq $s) { return $null }
    $x = $s
    $secret = $env:VERCEL_AUTOMATION_BYPASS_SECRET
    if ($secret) { $x = $x.Replace($secret, "<REDACTED:VERCEL_AUTOMATION_BYPASS_SECRET>") }
    return $x
}

function To-Array($x) {
    if ($null -eq $x) { return @() }
    if ($x -is [string]) { return @($x) }
    if ($x -is [System.Collections.IEnumerable]) { return @($x) }
    return @($x)
}

function Extract-LastHttpBlock([string]$text) {
    $clean = Strip-Ansi $text
    $m = [regex]::Matches($clean, '(?m)^HTTP/\d(?:\.\d)?\s+(?<code>\d{3})\b')
    if ($m.Count -eq 0) {
        return [pscustomobject]@{ httpStatus = $null; header = $null; body = $null; tail = $clean }
    }

    $last = $m[$m.Count - 1]
    $status = [int]$last.Groups["code"].Value
    $tail = $clean.Substring($last.Index)

    $parts = [regex]::Split($tail, "\r?\n\r?\n", 2)
    if ($parts.Count -ge 2) {
        return [pscustomobject]@{
            httpStatus = $status
            header     = $parts[0]
            body       = $parts[1].Trim()
            tail       = $tail
        }
    }

    return [pscustomobject]@{
        httpStatus = $status
        header     = $tail
        body       = $null
        tail       = $tail
    }
}

# Balanced scan (forward) => retourne le DERNIER segment { ... } équilibré (pas forcément JSON valide)
function Extract-LastJsonObjectBalanced([string]$text) {
    if ([string]::IsNullOrEmpty($text)) { return $null }

    $s = $text
    $depth = 0
    $start = -1
    $inString = $false
    $escape = $false
    $last = $null

    for ($i = 0; $i -lt $s.Length; $i++) {
        $ch = $s[$i]

        if ($escape) { $escape = $false; continue }

        if ($inString) {
            if ($ch -eq '\') { $escape = $true; continue }
            if ($ch -eq '"') { $inString = $false; continue }
            continue
        }

        if ($ch -eq '"') { $inString = $true; continue }

        if ($ch -eq '{') {
            if ($depth -eq 0) { $start = $i }
            $depth++
            continue
        }

        if ($ch -eq '}') {
            if ($depth -gt 0) { $depth-- }
            if ($depth -eq 0 -and $start -ge 0) {
                $last = $s.Substring($start, $i - $start + 1)
                $start = -1
            }
            continue
        }
    }

    return $last
}

function Try-ParseJson([string]$text) {
    if ($null -eq $text) { return $null }
    $t = $text.Trim()
    if ($t -eq "") { return $null }
    try { return ($t | ConvertFrom-Json -ErrorAction Stop) } catch { return $null }
}

function Invoke-NodeExtract([string]$text) {
    $node = Get-Command node -ErrorAction Stop
    $scriptPath = Join-Path (Split-Path -Parent $PSCommandPath) "vercel-e2e.extract.mjs"

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $node.Source
    $psi.Arguments = ('"{0}"' -f $scriptPath.Replace('"', '\"'))
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true

    $p = [System.Diagnostics.Process]::Start($psi)
    $p.StandardInput.Write(($text ?? ""))
    $p.StandardInput.Close()

    $stdout = $p.StandardOutput.ReadToEnd()
    $stderr = $p.StandardError.ReadToEnd()
    $p.WaitForExit()

    return [pscustomobject]@{
        exitCode = $p.ExitCode
        stdout   = $stdout
        stderr   = $stderr
        script   = $scriptPath
    }
}

function Parse-JsonWithFallback([string]$primaryText, [string]$fallbackText, [ref]$source) {
    $source.Value = "none"

    # 1) direct
    $p = Try-ParseJson $primaryText
    if ($p) { $source.Value = "ps"; return $p }

    # 2) PS balanced => last balanced braces
    $cand = Extract-LastJsonObjectBalanced $primaryText
    if ($cand) {
        $p = Try-ParseJson $cand
        if ($p) { $source.Value = "ps"; return $p }
    }

    # 3) Node (primary)
    try {
        $nx = Invoke-NodeExtract $primaryText
        if ($nx.exitCode -eq 0) {
            $p = Try-ParseJson $nx.stdout
            if ($p) { $source.Value = "node"; return $p }
        }
    }
    catch { }

    # 4) Node (fallback full stdout)
    try {
        $nx2 = Invoke-NodeExtract $fallbackText
        if ($nx2.exitCode -eq 0) {
            $p = Try-ParseJson $nx2.stdout
            if ($p) { $source.Value = "node"; return $p }
        }
    }
    catch { }

    return $null
}

function Get-CitationsCount($parsed) {
    if ($null -eq $parsed) { return 0 }

    $v = Get-PropValue $parsed "citationsUsed"
    if ($null -ne $v) {
        if ($v -is [int] -or $v -is [long] -or $v -is [double]) { return [int]$v }
        return (To-Array $v).Count
    }

    $countField = Get-PropValue $parsed "citationsCount"
    if ($null -ne $countField -and ($countField -is [int] -or $countField -is [long] -or $countField -is [double])) {
        return [int]$countField
    }

    $j = Get-PropValue $parsed "json"
    if ($null -ne $j) {
        $c = Get-PropValue $j "citations"
        if ($null -ne $c) { return (To-Array $c).Count }
    }

    return 0
}

function Get-HasZarathHint($parsed) {
    if ($null -eq $parsed) { return $false }

    $cits = Get-PropValue $parsed "citationsUsed"
    if ($null -eq $cits) {
        $j = Get-PropValue $parsed "json"
        if ($null -ne $j) { $cits = Get-PropValue $j "citations" }
    }

    foreach ($c in (To-Array $cits)) {
        $src = As-String (Get-PropValue $c "source")
        $file = As-String (Get-PropValue $c "file")
        $tit = As-String (Get-PropValue $c "title")
        if (("{0} {1} {2}" -f $src, $file, $tit) -match '(?i)zarat|zarath') { return $true }
    }
    return $false
}

function Get-CorpusLoaded($parsed) {
    if ($null -eq $parsed) { return $false }
    $k = Get-PropValue $parsed "knowledge"
    if ($null -eq $k) { return $false }
    $v = Get-PropValue $k "corpusLoaded"
    if ($null -eq $v) { return $false }
    try { return [bool]$v } catch { return $false }
}

function Resolve-CurlExe {
    $c = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    $c = Get-Command curl -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    throw "curl introuvable sur cette machine."
}

function Invoke-Curl([string[]]$argv) {
    $curl = Resolve-CurlExe
    $out = & $curl @argv 2>&1 | Out-String
    return [pscustomobject]@{ exe = $curl; output = $out; exitCode = $LASTEXITCODE }
}

function Run-SelfTest {
    # 1) citations count fixtures (anti-crash StrictMode)
    $fixtures = @(
        @{ name = "count-field"; input = @{ citationsCount = 6 }; expected = 6 },
        @{ name = "null"; input = @{ citationsUsed = $null }; expected = 0 },
        @{ name = "object"; input = @{ citationsUsed = @{ id = 1 } }; expected = 1 },
        @{ name = "array"; input = @{ citationsUsed = @(@{ id = 1 }, @{ id = 2 }) }; expected = 2 }
    )

    foreach ($fx in $fixtures) {
        $count = Get-CitationsCount $fx.input
        if ($count -ne $fx.expected) {
            throw ("SelfTest: " + $fx.name + " expected=" + $fx.expected + " got=" + $count)
        }
    }

    # 2) polluted stdout fixtures
    $pollutedPs = @(
        @"
noise line
HTTP/1.1 200 OK

{
  "traceId":"srv_test",
  "mode":"oracle",
  "citationsUsed":[{"source":"zarathoustra"}],
  "knowledge":{"corpusLoaded":true}
}
"@,
        @"
log1
{"a":1}
log2
{"traceId":"srv_last","mode":"oracle","citationsUsed":[{"source":"zarathoustra"},{"source":"zarathoustra"}],"knowledge":{"corpusLoaded":true}}
"@
    )

    foreach ($fx in $pollutedPs) {
        $cand = Extract-LastJsonObjectBalanced $fx
        $parsed = Try-ParseJson $cand
        if (-not $parsed) { throw "SelfTest: PS balanced extract failed" }
    }

    # 3) fixture forcing NODE recovery:
    # last balanced braces is NOT JSON, but previous object is valid JSON
    $pollutedNode = @"
logA
{"traceId":"srv_ok","mode":"oracle","citationsUsed":[{"source":"zarathoustra"}],"knowledge":{"corpusLoaded":true}}
tail
{ nope }
"@

    $src = "none"
    $p = Parse-JsonWithFallback $pollutedNode $pollutedNode ([ref]$src)
    if (-not $p) { throw "SelfTest: fallback parse failed" }
    if ($src -ne "node") { throw ("SelfTest: expected jsonParseSource=node got=" + $src) }

    # 4) node extractor direct
    $nx = Invoke-NodeExtract $pollutedNode
    if ($nx.exitCode -ne 0) { throw ("SelfTest: node extractor exitCode=" + $nx.exitCode) }
    $nxParsed = Try-ParseJson $nx.stdout
    if (-not $nxParsed) { throw "SelfTest: node extractor output not JSON" }

    # 5) artefacts offline (no BOM, no newline in latest pointer)
    $tempRoot = Join-Path $env:TEMP ("vercel-e2e-selftest-" + (Get-Date).ToString("yyyyMMdd_HHmmss"))
    Ensure-Dir $tempRoot

    $stamp = New-Stamp
    $runDir = Join-Path $tempRoot ("audit/ci/runs/" + $stamp)
    Ensure-Dir $runDir

    $latestDir = Join-Path $tempRoot "audit/_latest/smoke"
    Ensure-Dir $latestDir

    $rawPathT = Join-Path $runDir "raw.txt"
    $summaryPathT = Join-Path $runDir "summary.json"
    $responsePathT = Join-Path $runDir "response.json"
    $latestPathT = Join-Path $latestDir "latest.txt"

    Write-Utf8NoBom $rawPathT "raw"
    Write-JsonNoBom $summaryPathT ([ordered]@{ ok = $true; jsonParseSource = "ps" }) 10
    Write-JsonNoBom $responsePathT ([ordered]@{ ok = $true }) 10
    Write-Utf8NoBom $latestPathT $summaryPathT

    if (-not (Test-Path -LiteralPath $rawPathT)) { throw "SelfTest: raw missing" }
    if (-not (Test-Path -LiteralPath $summaryPathT)) { throw "SelfTest: summary missing" }
    if (-not (Test-Path -LiteralPath $responsePathT)) { throw "SelfTest: response missing" }
    if (-not (Test-Path -LiteralPath $latestPathT)) { throw "SelfTest: latest missing" }

    $latestRead = Get-Content -LiteralPath $latestPathT -Raw
    if ($latestRead -ne $summaryPathT) { throw "SelfTest: latest.txt content mismatch" }

    $respObj = Get-Content -LiteralPath $responsePathT -Raw | ConvertFrom-Json
    if ($null -eq $respObj) { throw "SelfTest: response.json not parseable" }

    Write-Host "SelfTest OK"
}

# ===== Main =====
if ($SelfTest) { Run-SelfTest; exit 0 }

$stamp = New-Stamp
$repo = (Resolve-Path -LiteralPath $RepoRoot).Path
Set-Location $repo

$runDir = Join-Path $repo ("audit/ci/runs/" + $stamp)
Ensure-Dir $runDir

$latestDir = Join-Path $repo "audit/_latest/smoke"
Ensure-Dir $latestDir

$logPath = Join-Path $runDir "run.log"
$rawPath = Join-Path $runDir "raw.txt"
$responsePath = Join-Path $runDir "response.json"
$summaryPath = Join-Path $runDir "summary.json"
$latestPath = Join-Path $latestDir "latest.txt"

function LogLine([string]$line) {
    $ts = (Get-Date).ToString("HH:mm:ss")
    Add-Content -LiteralPath $logPath -Value ("[{0}] {1}" -f $ts, $line) -Encoding utf8
}

$deployNorm = Normalize-DeployUrl $DeployUrl
$secret = $env:VERCEL_AUTOMATION_BYPASS_SECRET

$rawOut = ""
$parsed = $null
$httpStatus = $null
$errorCode = $null
$jsonParseSource = "none"
$summary = [ordered]@{
    ok    = $false
    error = [ordered]@{ code = "UNKNOWN"; message = "" }
    meta  = [ordered]@{
        stamp        = $stamp
        policy       = $Policy
        minCitations = $MinCitations
        timeoutSec   = $TimeoutSec
        runDir       = $runDir
    }
}

try {
    if ($deployNorm -eq "") { throw "DeployUrl manquant. Exemple: -DeployUrl https://monapp-xxxx.vercel.app" }

    $payload = [ordered]@{
        mode          = "oracle"
        prompt        = $Prompt
        ritual        = @{ step = "1"; intent = "e2e-smoke" }
        expectJson    = $true
        wantCitations = $true
    }
    $body = ($payload | ConvertTo-Json -Compress -Depth 10)

    LogLine ("stamp={0} repoRoot={1}" -f $stamp, $repo)
    LogLine ("deployUrl=" + $deployNorm)
    LogLine ("apiPath=" + $ApiPath)
    if (-not $secret) { LogLine "WARN: VERCEL_AUTOMATION_BYPASS_SECRET absent (risque 401)" }

    $argv = @(
        "-i", "-sS",
        "-m", "$TimeoutSec",
        "-X", "POST",
        "-H", "Content-Type: application/json"
    )
    if ($secret) { $argv += @("-H", ("x-vercel-protection-bypass: {0}" -f $secret)) }
    $argv += @("--data-binary", $body)
    $argv += @("{0}{1}" -f $deployNorm, $ApiPath)

    LogLine ("curl=" + (Resolve-CurlExe))

    $res = Invoke-Curl $argv
    $outClean = Strip-Ansi $res.output
    $rawOut = $outClean
    LogLine ("exitCode=" + $res.exitCode)

    $blk = Extract-LastHttpBlock $outClean
    $httpStatus = $blk.httpStatus

    $primaryText = ""
    if ($blk.body) { $primaryText = $blk.body.Trim() }

    $src = "none"
    $parsed = Parse-JsonWithFallback $primaryText $rawOut ([ref]$src)
    $jsonParseSource = $src

    $citCount = Get-CitationsCount $parsed
    $hasZarat = Get-HasZarathHint $parsed
    $corpusLoaded = Get-CorpusLoaded $parsed

    $checks = @()
    $checks += [ordered]@{ id = "http_cli_ok"; ok = ($res.exitCode -eq 0); reason = ("exitCode=" + $res.exitCode); metrics = @{ exitCode = $res.exitCode } }
    $checks += [ordered]@{ id = "http_status_2xx"; ok = ($httpStatus -ge 200 -and $httpStatus -lt 300); reason = ("httpStatus=" + ($httpStatus ?? "")); metrics = @{ httpStatus = $httpStatus } }
    $checks += [ordered]@{ id = "json_parse_ok"; ok = ($null -ne $parsed); reason = ($null -ne $parsed ? ("ok(" + $jsonParseSource + ")") : "failed"); metrics = @{ source = $jsonParseSource } }
    $checks += [ordered]@{ id = "citations_min"; ok = ($citCount -ge $MinCitations); reason = ("citations=" + $citCount); metrics = @{ min = $MinCitations; citationsCount = $citCount } }
    $checks += [ordered]@{ id = "corpus_loaded"; ok = $corpusLoaded; reason = ("corpusLoaded=" + $corpusLoaded); metrics = @{} }
    $checks += [ordered]@{ id = "has_zarat"; ok = $hasZarat; reason = ("hasZarat=" + $hasZarat); metrics = @{} }

    $overallOk = (@($checks | Where-Object { -not $_.ok })).Count -eq 0

    if (-not $overallOk) {
        if (-not (@($checks | Where-Object id -eq "http_status_2xx")).ok) { $errorCode = "http_status_not_2xx" }
        elseif (-not (@($checks | Where-Object id -eq "json_parse_ok")).ok) { $errorCode = "json_parse_failed" }
        else { $errorCode = "checks_failed" }
    }

    if ($parsed) {
        Write-JsonNoBom $responsePath $parsed 50
        LogLine ("response=" + $responsePath)
    }

    $summary = [ordered]@{
        ok              = $overallOk
        error           = [ordered]@{ code = ($errorCode ?? ""); message = "" }
        meta            = [ordered]@{
            stamp        = $stamp
            policy       = $Policy
            minCitations = $MinCitations
            timeoutSec   = $TimeoutSec
            runDir       = $runDir
        }
        httpStatus      = $httpStatus
        checks          = $checks
        jsonParseSource = $jsonParseSource
        responseSummary = [ordered]@{
            citationsCount      = $citCount
            hasZarathoustraHint = $hasZarat
            corpusLoaded        = $corpusLoaded
        }
    }
}
catch {
    $errorCode = "exception"
    $summary = [ordered]@{
        ok              = $false
        error           = [ordered]@{ code = $errorCode; message = $_.Exception.Message }
        meta            = [ordered]@{
            stamp        = $stamp
            policy       = $Policy
            minCitations = $MinCitations
            timeoutSec   = $TimeoutSec
            runDir       = $runDir
        }
        httpStatus      = $httpStatus
        checks          = @()
        jsonParseSource = $jsonParseSource
    }
}
finally {
    try {
        $rawToWrite = Redact (Trunc $rawOut 8000)
        Write-Utf8NoBom $rawPath $rawToWrite
        Write-JsonNoBom $summaryPath $summary 30
        Write-Utf8NoBom $latestPath $summaryPath
    }
    catch {}
}

if ($summary.ok) { exit 0 }
if ($Policy -eq "warn") { exit 2 }
exit 1
