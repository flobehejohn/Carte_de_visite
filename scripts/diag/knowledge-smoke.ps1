[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$RepoRoot = "",

    [Alias('Stamp')]
    [string]$RunStamp = "",

    [string]$Mode = "",
    [string]$Policy = "warn",
    [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ScriptDir "..\_lib\Log.ps1")
. (Join-Path $ScriptDir "..\_auditRun.ps1")

$log = New-LogState
if (-not $PSBoundParameters.ContainsKey("Quiet")) { $Quiet = $true }
if ($Quiet) { $VerbosePreference = "SilentlyContinue" }
$pushed = $false

function Normalize-Policy([string]$p) {
    if ([string]::IsNullOrWhiteSpace($p)) { return "warn" }
    $v = $p.ToLowerInvariant()
    if ($v -in @("warn", "warning")) { return "warn" }
    if ($v -in @("fail", "block", "strict")) { return "block" }
    return "warn"
}

function Try-ParseJsonFromOutput([string]$raw) {
    if ([string]::IsNullOrWhiteSpace($raw)) { return $null }

    # Force un tableau meme si 1 seule ligne (evite Count introuvable)
    $lines = @(
        ($raw -split "(`r`n|`n|`r)") |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    )
    if (-not $lines -or $lines.Length -eq 0) { return $null }

    # Candidate prioritaire: derniere ligne non vide
    $candidate = $lines[$lines.Length - 1].Trim()
    try {
        return ($candidate | ConvertFrom-Json -ErrorAction Stop)
    }
    catch {
        # Fallback: chercher la derniere ligne ressemblant a un JSON objet
        for ($i = $lines.Length - 1; $i -ge 0; $i--) {
            $c = $lines[$i].Trim()
            if ($c.StartsWith("{") -and $c.EndsWith("}")) {
                try { return ($c | ConvertFrom-Json -ErrorAction Stop) } catch {}
            }
        }
        return $null
    }
}

try {
    $audit = Resolve-AuditRun -RepoRoot $RepoRoot -OutDir ".\audit" -RunStamp $RunStamp -Mode $Mode -Prefix "KNOWSMOKE" -CleanLatest:$false
    $RepoRoot = $audit.RepoRoot
    $RunStamp = $audit.RunStamp
    $runDir = $audit.RunDir

    $policyValue = Normalize-Policy $Policy
    $isBlock = ($policyValue -eq "block")

    Info $log "knowledge-smoke start"
    Info $log ("Repo root : {0}" -f $RepoRoot)
    Info $log ("Run stamp : {0}" -f $RunStamp)
    Info $log ("Run dir   : {0}" -f $runDir)
    Info $log ("Policy    : {0}" -f $policyValue)

    Push-Location $RepoRoot
    $pushed = $true

    # 1) Tests knowledge (deterministes)
    $testLog = Join-Path $runDir ("knowledge_smoke_{0}.log" -f $RunStamp)
    $step = Invoke-Step -State $log -Name "knowledge-smoke" -LogPath $testLog -Quiet:$Quiet -Command {
        npx --no-install vitest run src/server/knowledge/retriever.test.ts src/server/knowledge/knowledgeLayer.contract.test.ts
    }

    # 2) Metrics (optionnelles, mais utiles) via import TS en ESM
    $metrics = $null
    $metricsRaw = $null
    try {
        $nodeCode = @"
const run = async () => {
  const { retrieveZaraCitations, RETRIEVER_VERSION } = await import('./src/server/knowledge/retriever.ts');
  const { getZaraCorpus } = await import('./src/server/knowledge/corpus.ts');

  const prompts = [
    'Rituel: je franchis le seuil et je cite Zarathoustra.',
    'Zarathoustra seuil et solitude',
    'Zarathoustra montagne et aurore'
  ];

  const results = prompts.map((p) => retrieveZaraCitations(p, { k: 5 }));
  const counts = results.map((r) => r.length);
  const min = Math.min(...counts);
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const emptyRate = counts.filter((c) => c === 0).length / counts.length;

  const corpus = getZaraCorpus();
  const payload = {
    corpus_loaded: true,
    corpus_size: corpus.sentences.length,
    corpus_hash: corpus.corpusHash || null,
    retriever_version: RETRIEVER_VERSION,
    citations_min: min,
    citations_avg: Math.round(avg * 100) / 100,
    knowledge_empty_rate: Math.round(emptyRate * 1000) / 1000
  };
  console.log(JSON.stringify(payload));
};

run().catch((err) => {
  console.log(JSON.stringify({ error: String(err && err.message ? err.message : err) }));
});
"@

        # IMPORTANT Node >= 20.6: utiliser --import (pas --loader)
        $metricsRaw = & node --import tsx --input-type=module -e $nodeCode 2>&1

        $parsed = Try-ParseJsonFromOutput ($metricsRaw | Out-String)
        if ($parsed) { $metrics = $parsed } else { throw "Could not parse metrics JSON" }

        if ($metrics.PSObject.Properties.Name -contains "error") {
            Warn $log ("metrics returned error: {0}" -f $metrics.error)
        }
        else {
            Ok $log "metrics collected"
        }
    }
    catch {
        $msg = $_.Exception.Message
        if (-not [string]::IsNullOrWhiteSpace($msg)) {
            Warn $log ("metrics collection failed: {0}" -f $msg)
        }
        else {
            Warn $log "metrics collection failed"
        }
    }

    $exitCode = if ($step.ExitCode -eq 0) { 0 } elseif ($isBlock) { 1 } else { 2 }
    if ($exitCode -eq 0) { Ok $log "Knowledge smoke OK" }
    elseif ($exitCode -eq 2) { Warn $log "Knowledge smoke WARN (policy=warn)" }
    else { Err $log "Knowledge smoke FAIL (policy=block)" }

    $txtPath = Join-Path $runDir ("knowledge_smoke_{0}.txt" -f $RunStamp)
    $jsonPath = Join-Path $runDir ("knowledge_smoke_{0}.json" -f $RunStamp)

    $payload = [ordered]@{
        timestamp = (Get-Date).ToString("o")
        runStamp  = $RunStamp
        repoRoot  = $RepoRoot
        policy    = $policyValue
        testExit  = $step.ExitCode
        exit      = $exitCode
        verdict   = if ($exitCode -eq 0) { "PASS" } elseif ($exitCode -eq 2) { "WARN" } else { "FAIL" }
        testLog   = $testLog
        metrics   = $metrics
        logs      = $log.Lines
    }

    Set-Content -LiteralPath $txtPath -Value ($log.Lines -join "`r`n") -Encoding ascii
    ($payload | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $jsonPath -Encoding ascii

    if ($exitCode -eq 0) { exit 0 }
    if ($exitCode -eq 2) { exit 2 }
    exit 1
}
catch {
    Err $log $_.Exception.Message
    exit 1
}
finally {
    if ($pushed) { Pop-Location }
}
