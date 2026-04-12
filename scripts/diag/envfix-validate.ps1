[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$RepoRoot = "",
    [string]$Stamp = ""
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

function Ensure-Audit([string]$RepoRoot) {
    $auditDir = Join-Path $RepoRoot "audit/_latest"
    New-Item -ItemType Directory -Force -Path $auditDir | Out-Null
    return $auditDir
}

function Sanitize-Line([string]$s) {
    if ($null -eq $s) { return $s }
    $t = [regex]::Replace($s, "`e\\[[0-9;]*[A-Za-z]", "")
    $t = [regex]::Replace($t, "`e\\][^`a]*`a", "")
    return $t
}

function Read-JsonLines([string]$Path) {
    $items = @()
    if (-not (Test-Path -LiteralPath $Path)) { return $items }
    foreach ($line in Get-Content -Path $Path) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        try {
            $obj = $line | ConvertFrom-Json -AsHashtable -ErrorAction Stop
            $items += $obj
        }
        catch { }
    }
    return $items
}

function Get-Val($obj, [string]$key) {
    if ($null -eq $obj) { return $null }
    if ($obj -is [System.Collections.IDictionary]) {
        if ($obj.Contains($key)) { return $obj[$key] }
        return $null
    }
    $p = $obj.PSObject.Properties[$key]
    if ($p) { return $p.Value }
    return $null
}

$RepoRoot = Ensure-Repo $RepoRoot
$auditDir = Ensure-Audit $RepoRoot
if ([string]::IsNullOrWhiteSpace($Stamp)) { $Stamp = (Get-Date -Format "yyyyMMdd_HHmmss") }

$report = Join-Path $auditDir ("codex_envfix_report_{0}.txt" -f $Stamp)
$spawnTrace = Join-Path $auditDir ("vercel_spawn_trace_{0}.log" -f $Stamp)
$vercelDebug = Join-Path $auditDir ("vercel_build_debug_{0}.log" -f $Stamp)

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("CODEX envfix ledger report")
$lines.Add(("Stamp: {0}" -f $Stamp))
$lines.Add(("Repo: {0}" -f $RepoRoot))
$lines.Add(("Date: {0}" -f (Get-Date).ToString("o")))
$lines.Add("")

# versions
$nodeV = Sanitize-Line ((& node -v 2>&1) | Select-Object -First 1)
$npmV = Sanitize-Line ((& npm -v 2>&1) | Select-Object -First 1)
$vercelV = Sanitize-Line ((& vercel --version 2>&1) | Select-Object -First 1)
$lines.Add("Versions")
$lines.Add(("node: {0}" -f $nodeV))
$lines.Add(("npm: {0}" -f $npmV))
$lines.Add(("vercel: {0}" -f $vercelV))
$lines.Add("")

# gate
$gateExit = 1
try {
    & pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\\gate.ps1") -RepoRoot $RepoRoot -Mode local 2>&1 | Out-Null
    $gateExit = $LASTEXITCODE
}
catch {
    $gateExit = 1
}

# selftest with hook + envfix
$selfExit = 1
$hookPath = (Resolve-Path -LiteralPath (Join-Path $RepoRoot "scripts\\diag\\hook-spawn.cjs")).Path
$hookPathNode = $hookPath.Replace("\", "/")
$oldNodeOptions = $env:NODE_OPTIONS
$oldEnvfix = $env:CODEX_SPAWN_ENVFIX
$oldTrace = $env:CODEX_SPAWN_TRACE_LOG

try {
    $env:NODE_OPTIONS = ($oldNodeOptions ? ($oldNodeOptions + " " + "--require $hookPathNode") : "--require $hookPathNode")
    $env:CODEX_SPAWN_ENVFIX = "1"
    $env:CODEX_SPAWN_TRACE_LOG = $spawnTrace
    & node (Join-Path $RepoRoot "scripts\\diag\\envfix-selftest.cjs") 2>&1 | Out-Null
    $selfExit = $LASTEXITCODE
}
catch {
    $selfExit = 1
}
finally {
    if ($oldNodeOptions) { $env:NODE_OPTIONS = $oldNodeOptions } else { Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue }
    if ($oldEnvfix) { $env:CODEX_SPAWN_ENVFIX = $oldEnvfix } else { Remove-Item Env:CODEX_SPAWN_ENVFIX -ErrorAction SilentlyContinue }
    if ($oldTrace) { $env:CODEX_SPAWN_TRACE_LOG = $oldTrace } else { Remove-Item Env:CODEX_SPAWN_TRACE_LOG -ErrorAction SilentlyContinue }
}

# vercel debug build (spawn trace enabled)
$vercelExit = 1
try {
    & pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\\vercel-build-debug.ps1") -RepoRoot $RepoRoot -Yes -NoEnvFile -EnableSpawnTrace -Stamp $Stamp 2>&1 | Out-Null
    $vercelExit = $LASTEXITCODE
}
catch {
    $vercelExit = 1
}

# detections
$enoent = $false
if (Test-Path -LiteralPath $vercelDebug) {
    $enoent = (Select-String -Path $vercelDebug -Pattern "spawn cmd.exe ENOENT" -Quiet)
}

$records = Read-JsonLines $spawnTrace
$spawnRecords = @($records | Where-Object {
    $m = Get-Val $_ "method"
    if (-not $m) { return $false }
    return ($m -in @("spawn","spawnSync","execFile","execFileSync"))
})

$spawnErrorCount = @($records | Where-Object {
    $m = Get-Val $_ "method"
    $e = Get-Val $_ "error"
    $mOk = $m -and ($m -like "*.error")
    $eOk = $e -ne $null
    return ($mOk -or $eOk)
}).Count

$cmdSpawnCount = @($spawnRecords | Where-Object {
    $c = Get-Val $_ "command"
    return ($c -and ($c -match "(?i)cmd\.exe$"))
}).Count

$envfixAppliedCount = @($records | Where-Object {
    $p = Get-Val $_ "envfix_applied"
    return ($p -eq $true)
}).Count

$pathTotal = 0
$pathHas = 0
foreach ($rec in $spawnRecords) {
    $envMeta = Get-Val $rec "env_meta"
    if (-not $envMeta) { continue }
    $has = $false
    $pathMeta = Get-Val $envMeta "PATH"
    $pathMeta2 = Get-Val $envMeta "Path"
    if ($pathMeta) {
        $hasPath = Get-Val $pathMeta "has_system32"
        if ($hasPath -eq $true) { $has = $true }
    }
    if ($pathMeta2) {
        $hasPath2 = Get-Val $pathMeta2 "has_system32"
        if ($hasPath2 -eq $true) { $has = $true }
    }
    $pathTotal += 1
    if ($has) { $pathHas += 1 }
}
$pathRate = if ($pathTotal -gt 0) { [math]::Round($pathHas / $pathTotal, 3) } else { 0 }

$lines.Add("Results")
$lines.Add(("gate_exit={0}" -f $gateExit))
$lines.Add(("selftest_exit={0}" -f $selfExit))
$lines.Add(("vercel_build_exit={0}" -f $vercelExit))
$lines.Add(("enoent_in_vercel_debug={0}" -f ($enoent ? "true" : "false")))
$lines.Add(("spawn_error_count={0}" -f $spawnErrorCount))
$lines.Add(("cmd_spawn_count={0}" -f $cmdSpawnCount))
$lines.Add(("envfix_applied_count={0}" -f $envfixAppliedCount))
$lines.Add(("path_has_system32_rate={0}" -f $pathRate))
$lines.Add("")

$lines.Add("Artifacts")
$lines.Add(("report={0}" -f $report))
$lines.Add(("vercel_debug_log={0}" -f $vercelDebug))
$lines.Add(("spawn_trace_log={0}" -f $spawnTrace))
$lines.Add("")

$pass = ($gateExit -eq 0 -and $selfExit -eq 0 -and $vercelExit -eq 0 -and -not $enoent)
$lines.Add(("Verdict: {0}" -f ($pass ? "PASS" : "FAIL")))

$lines | Out-File -FilePath $report -Encoding ascii

if (-not $pass) { exit 1 }
exit 0
