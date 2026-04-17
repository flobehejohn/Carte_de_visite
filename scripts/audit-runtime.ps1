[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$RepoRoot = "",

    [string]$OutDir = "audit/_latest/runtime",
    [string]$RunStamp = "",
    [int]$Keep = 3,

    [string]$PreviewHost = "127.0.0.1",
    [int]$Port = 4173,

    [int]$StartupTimeoutSec = 45,
    [int]$ReadyTimeoutMs = 15000,

    [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:ScriptDir = if ($PSScriptRoot -and $PSScriptRoot.Trim() -ne "") {
    $PSScriptRoot
}
elseif ($PSCommandPath -and $PSCommandPath.Trim() -ne "") {
    Split-Path -Parent $PSCommandPath
}
else {
    (Get-Location).Path
}

# ---------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------

$script:Quiet = [bool]$Quiet
if ($script:Quiet) {
    $VerbosePreference = "SilentlyContinue"
}
else {
    $VerbosePreference = "Continue"
}

$script:WarnCount = 0
$script:ErrCount = 0
$script:LogLines = New-Object System.Collections.Generic.List[string]

function Log([string]$Level, [string]$Message, [ConsoleColor]$Color = [ConsoleColor]::Gray) {
    $line = "[$Level] $Message"
    $script:LogLines.Add($line) | Out-Null

    if ($script:Quiet) {
        if ($Level -ne "INFO") {
            Write-Host $line -ForegroundColor $Color
        }
        return
    }

    if ($Level -eq "INFO") {
        Write-Verbose $line
    }
    else {
        Write-Host $line -ForegroundColor $Color
    }
}

function Info([string]$m) { Log "INFO" $m ([ConsoleColor]::Gray) }
function Ok([string]$m)   { Log "OK"   $m ([ConsoleColor]::Green) }
function Warn([string]$m) { $script:WarnCount++; Log "WARN" $m ([ConsoleColor]::Yellow) }
function Err([string]$m)  { $script:ErrCount++;  Log "ERR"  $m ([ConsoleColor]::Red) }

# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------

function Now-Stamp {
    return (Get-Date).ToString("yyyyMMdd_HHmmss")
}

function Ensure-Dir([string]$Path) {
    if (-not $Path -or $Path.Trim() -eq "") {
        throw "Ensure-Dir: chemin vide."
    }

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Resolve-RepoRootPath([string]$RepoRootArg) {
    if ($RepoRootArg -and $RepoRootArg.Trim() -ne "") {
        return (Resolve-Path -LiteralPath $RepoRootArg).Path
    }

    $candidate = Join-Path $script:ScriptDir ".."
    return (Resolve-Path -LiteralPath $candidate).Path
}

function Resolve-OutDirAbs([string]$RepoRootPath, [string]$OutDirArg, [string]$DefaultSubDir) {
    if (-not $OutDirArg -or $OutDirArg.Trim() -eq "") {
        return (Join-Path $RepoRootPath $DefaultSubDir)
    }

    if ([System.IO.Path]::IsPathRooted($OutDirArg)) {
        return $OutDirArg
    }

    return (Join-Path $RepoRootPath $OutDirArg)
}

function Wait-UrlReady(
    [string]$Url,
    [int]$TimeoutSec,
    [System.Diagnostics.Process]$PreviewProcess,
    [string]$StdErrPath
) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)

    while ((Get-Date) -lt $deadline) {
        if ($null -ne $PreviewProcess -and $PreviewProcess.HasExited) {
            $stderr = ""
            if (Test-Path -LiteralPath $StdErrPath) {
                $stderr = Get-Content -LiteralPath $StdErrPath -Raw -ErrorAction SilentlyContinue
            }
            throw "Le serveur preview s'est arrêté avant d'être prêt. stderr=`n$stderr"
        }

        try {
            $response = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 5
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return
            }
        }
        catch {
            Start-Sleep -Milliseconds 250
        }
    }

    throw "Timeout en attente du serveur preview sur $Url"
}

function Publish-Latest(
    [string]$RunDir,
    [string]$LatestDir,
    [string]$BaseDir,
    [int]$KeepCount
) {
    Ensure-Dir $LatestDir

    Get-ChildItem -LiteralPath $LatestDir -Force -ErrorAction SilentlyContinue |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

    Get-ChildItem -LiteralPath $RunDir -Force -ErrorAction SilentlyContinue | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $LatestDir -Recurse -Force
    }

    if (Test-Path -LiteralPath $BaseDir) {
        $dirs = Get-ChildItem -LiteralPath $BaseDir -Directory |
            Sort-Object Name -Descending

        $toDelete = $dirs | Select-Object -Skip $KeepCount
        foreach ($dir in $toDelete) {
            Remove-Item -LiteralPath $dir.FullName -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    return $LatestDir
}

# ---------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------

$RepoRootAbs = ""
$runDir = ""
$latestDir = ""
$baseDir = ""
$previewProc = $null
$probeScriptPath = ""
$probeStdOutPath = ""
$probeStdErrPath = ""
$txtPath = ""
$jsonPath = ""
$summaryPath = ""
$manifestPath = ""
$previewStdOut = ""
$previewStdErr = ""
$previewUrl = ""
$probe = $null

try {
    $RepoRootAbs = Resolve-RepoRootPath -RepoRootArg $RepoRoot
    if (-not $RunStamp -or $RunStamp.Trim() -eq "") {
        $RunStamp = Now-Stamp
    }

    $baseDir = Join-Path $RepoRootAbs "audit\runtime"
    $runDir = Join-Path $baseDir $RunStamp
    $latestDir = Resolve-OutDirAbs -RepoRootPath $RepoRootAbs -OutDirArg $OutDir -DefaultSubDir "audit/_latest/runtime"

    Ensure-Dir $baseDir
    Ensure-Dir $runDir
    Ensure-Dir $latestDir

    $txtPath = Join-Path $runDir ("runtimeaudit_{0}.txt" -f $RunStamp)
    $jsonPath = Join-Path $runDir ("runtimeaudit_{0}.json" -f $RunStamp)
    $summaryPath = Join-Path $runDir "summary.json"
    $manifestPath = Join-Path $runDir "audit-manifest.json"

    $previewStdOut = Join-Path $runDir "vite-preview.stdout.log"
    $previewStdErr = Join-Path $runDir "vite-preview.stderr.log"
    $probeStdOutPath = Join-Path $runDir "runtime-probe.stdout.json"
    $probeStdErrPath = Join-Path $runDir "runtime-probe.stderr.log"

    $distIndex = Join-Path $RepoRootAbs "dist\index.html"
    $viteBin = Join-Path $RepoRootAbs "node_modules\vite\bin\vite.js"
    $playwrightPkg = Join-Path $RepoRootAbs "node_modules\playwright\package.json"

    if (-not (Test-Path -LiteralPath $distIndex)) {
        throw "Build introuvable : $distIndex. Lance d'abord 'npm run build'."
    }

    if (-not (Test-Path -LiteralPath $viteBin)) {
        throw "Vite introuvable : $viteBin. Vérifie 'npm install'."
    }

    if (-not (Test-Path -LiteralPath $playwrightPkg)) {
        throw "Playwright introuvable : $playwrightPkg. Vérifie 'npm install' puis 'npx playwright install chromium'."
    }

    Info "Script dir        : $script:ScriptDir"
    Info "Repo root         : $RepoRootAbs"
    Info "Run stamp         : $RunStamp"
    Info "Build détecté     : $distIndex"
    Info "Vite preview bin  : $viteBin"
    Info "Playwright pkg    : $playwrightPkg"

    $previewUrl = "http://{0}:{1}" -f $PreviewHost, $Port
    Info "Démarrage de vite preview sur $previewUrl"

    $previewProc = Start-Process `
        -FilePath "node" `
        -ArgumentList @(
            $viteBin,
            "preview",
            "--host", $PreviewHost,
            "--port", $Port.ToString(),
            "--strictPort"
        ) `
        -WorkingDirectory $RepoRootAbs `
        -RedirectStandardOutput $previewStdOut `
        -RedirectStandardError $previewStdErr `
        -PassThru

    Wait-UrlReady -Url $previewUrl -TimeoutSec $StartupTimeoutSec -PreviewProcess $previewProc -StdErrPath $previewStdErr
    Ok "Serveur preview disponible."

    $probeScriptPath = Join-Path $runDir "runtime_probe.cjs"

    @'
const { chromium } = require("playwright");

(async () => {
  const url = process.env.AUDIT_URL;
  const timeoutMs = Number(process.env.AUDIT_READY_TIMEOUT_MS || "15000");

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-angle=swiftshader",
      "--disable-dev-shm-usage"
    ]
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 }
  });

  const browserConsole = [];
  const pageErrors = [];
  const requestFailures = [];

  page.on("console", (msg) => {
    browserConsole.push({
      type: msg.type(),
      text: msg.text()
    });
  });

  page.on("pageerror", (err) => {
    pageErrors.push(String(err && err.stack ? err.stack : err));
  });

  page.on("requestfailed", (req) => {
    requestFailures.push({
      url: req.url(),
      method: req.method(),
      failure: req.failure()
    });
  });

  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs
    });

    await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 10000) }).catch(() => null);

    await page.waitForFunction(
      () => typeof window !== "undefined" && !!window.__ORB_AUDIT__,
      { timeout: timeoutMs }
    ).catch(() => null);

    const result = await page.evaluate(async ({ timeoutMs }) => {
      function collectUndefinedPaths(value, path, acc) {
        if (value === undefined) {
          acc.push(path || "<root>");
          return;
        }
        if (value === null) {
          return;
        }
        if (Array.isArray(value)) {
          for (let i = 0; i < value.length; i += 1) {
            collectUndefinedPaths(value[i], `${path}[${i}]`, acc);
          }
          return;
        }
        if (typeof value === "object") {
          for (const key of Object.keys(value)) {
            const nextPath = path ? `${path}.${key}` : key;
            collectUndefinedPaths(value[key], nextPath, acc);
          }
        }
      }

      function readPath(obj, dottedPath) {
        if (!obj || typeof obj !== "object") return undefined;
        const segments = dottedPath.split(".");
        let cur = obj;
        for (const segment of segments) {
          if (cur == null || typeof cur !== "object" || !(segment in cur)) {
            return undefined;
          }
          cur = cur[segment];
        }
        return cur;
      }

      function summarizeObject(value) {
        if (value == null) return null;
        if (typeof value !== "object") {
          return {
            type: typeof value,
            value
          };
        }
        return {
          type: Array.isArray(value) ? "array" : "object",
          keys: Object.keys(value).sort()
        };
      }

      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      const payload = {
        url: window.location.href,
        title: document.title,
        userAgent: navigator.userAgent,
        httpStatus: null,
        hasAudit: false,
        auditKeys: [],
        ready: null,
        snapshotNull: true,
        snapshotType: null,
        snapshotTopLevelKeys: [],
        snapshotJsonLength: 0,
        snapshotPaths: {
          existingCriticalPaths: [],
          missingCriticalPaths: [],
          undefinedPaths: [],
          criticalUndefinedPaths: []
        },
        exportChecks: {
          orchestratorTimings: { exists: false, type: null, keys: [] },
          fluidMetrics: { exists: false, type: null, keys: [] },
          climateRuntime: { exists: false, type: null, keys: [] },
          climateTargets: { exists: false, type: null, keys: [] },
          qualityProfile: { exists: false, type: null, value: null },
          qualityProfiles: {
            exists: false,
            type: null,
            keys: [],
            hasCurrent: false,
            currentType: null,
            currentValue: null,
            hasForced: false,
            forcedType: null,
            forcedValue: null,
            hasEstimatedCost: false,
            estimatedCostType: null,
            estimatedCostValue: null
          },
          counters: {
            exists: false,
            type: null,
            keys: [],
            hasReset: false,
            resetType: null,
            resetValue: null,
            hasReinit: false,
            reinitType: null,
            reinitValue: null
          }
        },
        exported: {
          orchestratorTimings: null,
          fluidMetrics: null,
          climateRuntime: null,
          climateTargets: null,
          qualityProfile: null,
          qualityProfiles: null,
          counters: null
        },
        errors: []
      };

      const audit = window.__ORB_AUDIT__;
      if (!audit) {
        payload.errors.push("window.__ORB_AUDIT__ absent");
        return payload;
      }

      payload.hasAudit = true;
      payload.auditKeys = Object.keys(audit).sort();

      if (typeof audit.ready !== "function") {
        payload.errors.push("ready() manquant");
      } else {
        try {
          const start = Date.now();
          let readyValue = false;

          while ((Date.now() - start) < timeoutMs) {
            const current = await Promise.resolve(audit.ready());
            readyValue = !!current;
            if (readyValue) break;
            await sleep(100);
          }

          payload.ready = readyValue;
          if (!readyValue) {
            payload.errors.push("ready() faux après timeout");
          }
        } catch (error) {
          payload.errors.push(`ready() exception: ${error?.message || String(error)}`);
        }
      }

      let snapshot = null;

      if (typeof audit.snapshot !== "function") {
        payload.errors.push("snapshot() manquant");
      } else {
        try {
          snapshot = await Promise.resolve(audit.snapshot());
          payload.snapshotNull = snapshot == null;
          payload.snapshotType = snapshot == null ? null : typeof snapshot;

          if (snapshot == null) {
            payload.errors.push("snapshot() nul");
          } else if (typeof snapshot !== "object") {
            payload.errors.push(`snapshot() type invalide: ${typeof snapshot}`);
          } else {
            payload.snapshotTopLevelKeys = Object.keys(snapshot).sort();

            try {
              const json = JSON.stringify(snapshot);
              payload.snapshotJsonLength = json ? json.length : 0;
            } catch (error) {
              payload.errors.push(`snapshot() non sérialisable: ${error?.message || String(error)}`);
            }

            const undefinedPaths = [];
            collectUndefinedPaths(snapshot, "", undefinedPaths);
            payload.snapshotPaths.undefinedPaths = undefinedPaths.sort();

            const criticalPaths = [
              "orchestratorTimings",
              "fluidMetrics",
              "climateRuntime",
              "climateTargets",
              "qualityProfile",
              "qualityProfiles.current",
              "counters.reset",
              "counters.reinit"
            ];

            for (const p of criticalPaths) {
              const value = readPath(snapshot, p);
              if (value === undefined) {
                payload.snapshotPaths.missingCriticalPaths.push(p);
              } else {
                payload.snapshotPaths.existingCriticalPaths.push(p);
              }
            }

            const criticalRoots = [
              "orchestratorTimings",
              "fluidMetrics",
              "climateRuntime",
              "climateTargets",
              "qualityProfile",
              "qualityProfiles",
              "counters"
            ];

            payload.snapshotPaths.criticalUndefinedPaths = payload.snapshotPaths.undefinedPaths
              .filter((p) =>
                criticalRoots.some((root) =>
                  p === root || p.startsWith(`${root}.`) || p.startsWith(`${root}[`)
                )
              )
              .sort();

            const ot = snapshot.orchestratorTimings;
            payload.exportChecks.orchestratorTimings.exists = ot !== undefined;
            payload.exportChecks.orchestratorTimings.type = ot === null ? "null" : typeof ot;
            payload.exportChecks.orchestratorTimings.keys = ot && typeof ot === "object" ? Object.keys(ot).sort() : [];
            payload.exported.orchestratorTimings = summarizeObject(ot);

            const fm = snapshot.fluidMetrics;
            payload.exportChecks.fluidMetrics.exists = fm !== undefined;
            payload.exportChecks.fluidMetrics.type = fm === null ? "null" : typeof fm;
            payload.exportChecks.fluidMetrics.keys = fm && typeof fm === "object" ? Object.keys(fm).sort() : [];
            payload.exported.fluidMetrics = summarizeObject(fm);

            const cr = snapshot.climateRuntime;
            payload.exportChecks.climateRuntime.exists = cr !== undefined;
            payload.exportChecks.climateRuntime.type = cr === null ? "null" : typeof cr;
            payload.exportChecks.climateRuntime.keys = cr && typeof cr === "object" ? Object.keys(cr).sort() : [];
            payload.exported.climateRuntime = summarizeObject(cr);

            const ct = snapshot.climateTargets;
            payload.exportChecks.climateTargets.exists = ct !== undefined;
            payload.exportChecks.climateTargets.type = ct === null ? "null" : typeof ct;
            payload.exportChecks.climateTargets.keys = ct && typeof ct === "object" ? Object.keys(ct).sort() : [];
            payload.exported.climateTargets = summarizeObject(ct);

            const qp = snapshot.qualityProfile;
            payload.exportChecks.qualityProfile.exists = Object.prototype.hasOwnProperty.call(snapshot, "qualityProfile");
            payload.exportChecks.qualityProfile.type = qp === null ? "null" : typeof qp;
            payload.exportChecks.qualityProfile.value = qp ?? null;
            payload.exported.qualityProfile = qp ?? null;

            const qps = snapshot.qualityProfiles;
            payload.exportChecks.qualityProfiles.exists = qps !== undefined;
            payload.exportChecks.qualityProfiles.type = qps === null ? "null" : typeof qps;
            payload.exportChecks.qualityProfiles.keys = qps && typeof qps === "object" ? Object.keys(qps).sort() : [];
            payload.exportChecks.qualityProfiles.hasCurrent =
              !!qps && typeof qps === "object" && Object.prototype.hasOwnProperty.call(qps, "current");
            payload.exportChecks.qualityProfiles.currentType =
              payload.exportChecks.qualityProfiles.hasCurrent
                ? (qps.current === null ? "null" : typeof qps.current)
                : null;
            payload.exportChecks.qualityProfiles.currentValue =
              payload.exportChecks.qualityProfiles.hasCurrent ? qps.current ?? null : null;
            payload.exportChecks.qualityProfiles.hasForced =
              !!qps && typeof qps === "object" && Object.prototype.hasOwnProperty.call(qps, "forced");
            payload.exportChecks.qualityProfiles.forcedType =
              payload.exportChecks.qualityProfiles.hasForced
                ? (qps.forced === null ? "null" : typeof qps.forced)
                : null;
            payload.exportChecks.qualityProfiles.forcedValue =
              payload.exportChecks.qualityProfiles.hasForced ? qps.forced ?? null : null;
            payload.exportChecks.qualityProfiles.hasEstimatedCost =
              !!qps && typeof qps === "object" && Object.prototype.hasOwnProperty.call(qps, "estimatedCost");
            payload.exportChecks.qualityProfiles.estimatedCostType =
              payload.exportChecks.qualityProfiles.hasEstimatedCost
                ? (qps.estimatedCost === null ? "null" : typeof qps.estimatedCost)
                : null;
            payload.exportChecks.qualityProfiles.estimatedCostValue =
              payload.exportChecks.qualityProfiles.hasEstimatedCost ? qps.estimatedCost ?? null : null;
            payload.exported.qualityProfiles = qps == null ? null : {
              current: payload.exportChecks.qualityProfiles.currentValue,
              forced: payload.exportChecks.qualityProfiles.forcedValue,
              estimatedCost: payload.exportChecks.qualityProfiles.estimatedCostValue
            };

            const counters = snapshot.counters;
            payload.exportChecks.counters.exists = counters !== undefined;
            payload.exportChecks.counters.type = counters === null ? "null" : typeof counters;
            payload.exportChecks.counters.keys = counters && typeof counters === "object" ? Object.keys(counters).sort() : [];
            payload.exportChecks.counters.hasReset =
              !!counters && typeof counters === "object" && Object.prototype.hasOwnProperty.call(counters, "reset");
            payload.exportChecks.counters.resetType =
              payload.exportChecks.counters.hasReset
                ? (counters.reset === null ? "null" : typeof counters.reset)
                : null;
            payload.exportChecks.counters.resetValue =
              payload.exportChecks.counters.hasReset ? counters.reset ?? null : null;
            payload.exportChecks.counters.hasReinit =
              !!counters && typeof counters === "object" && Object.prototype.hasOwnProperty.call(counters, "reinit");
            payload.exportChecks.counters.reinitType =
              payload.exportChecks.counters.hasReinit
                ? (counters.reinit === null ? "null" : typeof counters.reinit)
                : null;
            payload.exportChecks.counters.reinitValue =
              payload.exportChecks.counters.hasReinit ? counters.reinit ?? null : null;
            payload.exported.counters = counters == null ? null : {
              reset: payload.exportChecks.counters.resetValue,
              reinit: payload.exportChecks.counters.reinitValue
            };
          }
        } catch (error) {
          payload.errors.push(`snapshot() exception: ${error?.message || String(error)}`);
        }
      }

      return payload;
    }, { timeoutMs });

    result.httpStatus = response ? response.status() : null;
    result.browserConsole = browserConsole;
    result.pageErrors = pageErrors;
    result.requestFailures = requestFailures;

    process.stdout.write(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(String(error?.stack || error?.message || error));
  process.exit(1);
});
'@ | Set-Content -LiteralPath $probeScriptPath -Encoding UTF8

    Info "Exécution de la sonde navigateur Playwright"

    $env:AUDIT_URL = $previewUrl
    $env:AUDIT_READY_TIMEOUT_MS = $ReadyTimeoutMs.ToString()

    $probeOut = & node $probeScriptPath 2> $probeStdErrPath
    $probeExit = $LASTEXITCODE

    Set-Content -LiteralPath $probeStdOutPath -Value (($probeOut | Out-String).Trim()) -Encoding UTF8

    Remove-Item Env:\AUDIT_URL -ErrorAction SilentlyContinue
    Remove-Item Env:\AUDIT_READY_TIMEOUT_MS -ErrorAction SilentlyContinue

    if ($probeExit -ne 0) {
        $probeErr = ""
        if (Test-Path -LiteralPath $probeStdErrPath) {
            $probeErr = (Get-Content -LiteralPath $probeStdErrPath -Raw -ErrorAction SilentlyContinue).Trim()
        }

        $probeRaw = ""
        if (Test-Path -LiteralPath $probeStdOutPath) {
            $probeRaw = (Get-Content -LiteralPath $probeStdOutPath -Raw -ErrorAction SilentlyContinue).Trim()
        }

        throw "Échec de la sonde navigateur.`nstdout:`n$probeRaw`n`nstderr:`n$probeErr"
    }

    $probeRaw = ""
    if (Test-Path -LiteralPath $probeStdOutPath) {
        $probeRaw = (Get-Content -LiteralPath $probeStdOutPath -Raw -ErrorAction SilentlyContinue).Trim()
    }

    if (-not $probeRaw) {
        throw "La sonde navigateur n'a produit aucune sortie JSON."
    }

    $probe = $probeRaw | ConvertFrom-Json -Depth 100

    if ($probe.hasAudit) { Ok "window.__ORB_AUDIT__ disponible." }
    else { Err "window.__ORB_AUDIT__ indisponible." }

    if ($probe.ready -eq $true) { Ok "ready() = true." }
    else { Err "ready() != true." }

    if ($probe.snapshotNull -eq $false) { Ok "snapshot() exploitable." }
    else { Err "snapshot() nul." }

    if ($probe.snapshotType -eq "object") { Ok "snapshot() de type objet." }
    else { Err "snapshot() type inattendu : $($probe.snapshotType)" }

    if (@($probe.snapshotTopLevelKeys).Count -gt 0) {
        Ok ("Structure cohérente : {0} clés top-level." -f @($probe.snapshotTopLevelKeys).Count)
    }
    else {
        Err "Structure incohérente : aucune clé top-level dans snapshot()."
    }

    if (($probe.snapshotJsonLength -as [int]) -gt 2) {
        Ok ("snapshot() sérialisable (JSON length = {0})." -f $probe.snapshotJsonLength)
    }
    else {
        Err "snapshot() non exploitable ou JSON trop court."
    }

    $criticalUndefined = @($probe.snapshotPaths.criticalUndefinedPaths)
    if ($criticalUndefined.Count -eq 0) {
        Ok "Aucun champ critique undefined détecté."
    }
    else {
        Err ("Champs critiques undefined détectés : {0}" -f ($criticalUndefined -join ", "))
    }

    $missingCritical = @($probe.snapshotPaths.missingCriticalPaths)
    if ($missingCritical.Count -eq 0) {
        Ok "Tous les champs du contrat runtime 2.2 existent et sont exportés."
    }
    else {
        Err ("Champs du contrat runtime 2.2 manquants : {0}" -f ($missingCritical -join ", "))
    }

    if ($probe.exportChecks.orchestratorTimings.exists -and $probe.exportChecks.orchestratorTimings.type -eq 'object') {
        Ok ("orchestratorTimings exporté (clés: {0})." -f ((@($probe.exportChecks.orchestratorTimings.keys)) -join ", "))
    }
    else {
        Err "orchestratorTimings absent ou invalide."
    }

    if ($probe.exportChecks.fluidMetrics.exists -and $probe.exportChecks.fluidMetrics.type -eq 'object') {
        Ok ("fluidMetrics exporté (clés: {0})." -f ((@($probe.exportChecks.fluidMetrics.keys)) -join ", "))
    }
    else {
        Err "fluidMetrics absent ou invalide."
    }

    if ($probe.exportChecks.climateRuntime.exists -and $probe.exportChecks.climateRuntime.type -eq 'object') {
        Ok ("climateRuntime exporté (clés: {0})." -f ((@($probe.exportChecks.climateRuntime.keys)) -join ", "))
    }
    else {
        Err "climateRuntime absent ou invalide."
    }

    if ($probe.exportChecks.climateTargets.exists -and $probe.exportChecks.climateTargets.type -eq 'object') {
        Ok ("climateTargets exporté (clés: {0})." -f ((@($probe.exportChecks.climateTargets.keys)) -join ", "))
    }
    else {
        Err "climateTargets absent ou invalide."
    }

    $qualityProfileType = $probe.exportChecks.qualityProfile.type
    if ($probe.exportChecks.qualityProfile.exists -and ($qualityProfileType -eq 'string' -or $qualityProfileType -eq 'null')) {
        Ok ("qualityProfile exporté (type: {0}, value: {1})." -f $qualityProfileType, $probe.exportChecks.qualityProfile.value)
    }
    else {
        Err "qualityProfile absent ou invalide."
    }

    $qualityProfilesValid =
        $probe.exportChecks.qualityProfiles.exists -and
        $probe.exportChecks.qualityProfiles.type -eq 'object' -and
        $probe.exportChecks.qualityProfiles.hasCurrent -and
        ($probe.exportChecks.qualityProfiles.currentType -eq 'string' -or $probe.exportChecks.qualityProfiles.currentType -eq 'null') -and
        $probe.exportChecks.qualityProfiles.hasForced -and
        ($probe.exportChecks.qualityProfiles.forcedType -eq 'string' -or $probe.exportChecks.qualityProfiles.forcedType -eq 'null') -and
        $probe.exportChecks.qualityProfiles.hasEstimatedCost -and
        $probe.exportChecks.qualityProfiles.estimatedCostType -eq 'number'

    if ($qualityProfilesValid) {
        Ok ("qualityProfiles exporté (current={0}, forced={1}, estimatedCost={2})." -f `
            $probe.exportChecks.qualityProfiles.currentValue, `
            $probe.exportChecks.qualityProfiles.forcedValue, `
            $probe.exportChecks.qualityProfiles.estimatedCostValue)
    }
    else {
        Err "qualityProfiles absent ou invalide."
    }

    $countersValid =
        $probe.exportChecks.counters.exists -and
        $probe.exportChecks.counters.type -eq 'object' -and
        $probe.exportChecks.counters.hasReset -and
        $probe.exportChecks.counters.resetType -eq 'number' -and
        $probe.exportChecks.counters.hasReinit -and
        $probe.exportChecks.counters.reinitType -eq 'number'

    if ($countersValid) {
        Ok ("counters exporté (reset={0}, reinit={1})." -f `
            $probe.exportChecks.counters.resetValue, `
            $probe.exportChecks.counters.reinitValue)
    }
    else {
        Err "counters absent ou invalide."
    }

    foreach ($browserError in @($probe.errors)) {
        Err ("Sonde navigateur : {0}" -f $browserError)
    }

    foreach ($pageError in @($probe.pageErrors)) {
        Warn ("pageerror : {0}" -f $pageError)
    }

    if (@($probe.requestFailures).Count -gt 0) {
        Warn ("request failures détectés : {0}" -f @($probe.requestFailures).Count)
    }

    Info ("Clés __ORB_AUDIT__ : {0}" -f ((@($probe.auditKeys)) -join ", "))
    Info ("Clés snapshot top-level : {0}" -f ((@($probe.snapshotTopLevelKeys)) -join ", "))
}
catch {
    Err $_.Exception.Message
}
finally {
    if ($null -ne $previewProc) {
        try {
            if (-not $previewProc.HasExited) {
                Stop-Process -Id $previewProc.Id -Force -ErrorAction SilentlyContinue
            }
        }
        catch {
        }
    }
}

# ---------------------------------------------------------------------
# Artifacts
# ---------------------------------------------------------------------

$exitCode = if ($script:ErrCount -gt 0) { 1 } elseif ($script:WarnCount -gt 0) { 2 } else { 0 }

$guaranteed = @()
if ($null -ne $probe) {
    if ($probe.hasAudit -eq $true) { $guaranteed += "window.__ORB_AUDIT__ disponible" }
    if ($probe.ready -eq $true) { $guaranteed += "ready() vrai" }
    if ($probe.snapshotNull -eq $false -and $probe.snapshotType -eq "object") { $guaranteed += "snapshot() exploitable" }
    if (@($probe.snapshotTopLevelKeys).Count -gt 0) { $guaranteed += "structure cohérente" }
    if (@($probe.snapshotPaths.criticalUndefinedPaths).Count -eq 0) { $guaranteed += "pas de champs critiques undefined" }
}

$exportedRuntimeContract = @()
if ($null -ne $probe) {
    if ($probe.exportChecks.orchestratorTimings.exists) { $exportedRuntimeContract += "orchestratorTimings" }
    if ($probe.exportChecks.fluidMetrics.exists) { $exportedRuntimeContract += "fluidMetrics" }
    if ($probe.exportChecks.climateRuntime.exists) { $exportedRuntimeContract += "climateRuntime" }
    if ($probe.exportChecks.climateTargets.exists) { $exportedRuntimeContract += "climateTargets" }
    if ($probe.exportChecks.qualityProfile.exists) { $exportedRuntimeContract += "qualityProfile" }
    if ($probe.exportChecks.qualityProfiles.exists -and $probe.exportChecks.qualityProfiles.hasCurrent) { $exportedRuntimeContract += "qualityProfiles.current" }
    if ($probe.exportChecks.counters.exists -and $probe.exportChecks.counters.hasReset) { $exportedRuntimeContract += "counters.reset" }
    if ($probe.exportChecks.counters.exists -and $probe.exportChecks.counters.hasReinit) { $exportedRuntimeContract += "counters.reinit" }
}

$nullable = @()
if ($null -ne $probe) {
    $nullable = @($probe.snapshotPaths.missingCriticalPaths)
}

$nextPhaseCandidates = @(
    "runtime budgets",
    "quality budgets per device",
    "multi-device certification"
)

$exportsSummary = [ordered]@{
    orchestratorTimings = if ($null -ne $probe) { $probe.exported.orchestratorTimings } else { $null }
    fluidMetrics = if ($null -ne $probe) { $probe.exported.fluidMetrics } else { $null }
    climateRuntime = if ($null -ne $probe) { $probe.exported.climateRuntime } else { $null }
    climateTargets = if ($null -ne $probe) { $probe.exported.climateTargets } else { $null }
    qualityProfile = if ($null -ne $probe) { $probe.exported.qualityProfile } else { $null }
    qualityProfiles = if ($null -ne $probe) { $probe.exported.qualityProfiles } else { $null }
    counters = if ($null -ne $probe) { $probe.exported.counters } else { $null }
}

$summary = [ordered]@{
    timestamp = (Get-Date).ToString("o")
    runStamp = $RunStamp
    repoRoot = $RepoRootAbs
    url = $previewUrl
    summary = [ordered]@{
        warn = $script:WarnCount
        err  = $script:ErrCount
        exit = $exitCode
    }
    contract = [ordered]@{
        orbAuditAvailable = if ($null -ne $probe) { [bool]$probe.hasAudit } else { $false }
        readyTrue = if ($null -ne $probe) { [bool]$probe.ready } else { $false }
        snapshotUsable = if ($null -ne $probe) { ($probe.snapshotNull -eq $false -and $probe.snapshotType -eq "object") } else { $false }
        coherentStructure = if ($null -ne $probe) { (@($probe.snapshotTopLevelKeys).Count -gt 0) } else { $false }
        criticalUndefinedCount = if ($null -ne $probe) { @($probe.snapshotPaths.criticalUndefinedPaths).Count } else { -1 }
    }
    guaranteed = $guaranteed
    exportedRuntimeContract = $exportedRuntimeContract
    nullable = $nullable
    exports = $exportsSummary
    nextPhaseCandidates = $nextPhaseCandidates
}

$payload = [ordered]@{
    timestamp = (Get-Date).ToString("o")
    runStamp = $RunStamp
    repoRoot = $RepoRootAbs
    outDir = $runDir
    latestDir = $latestDir
    url = $previewUrl
    probe = $probe
    summary = $summary
    artifacts = [ordered]@{
        text = $txtPath
        json = $jsonPath
        summary = $summaryPath
        manifest = $manifestPath
        viteStdOut = $previewStdOut
        viteStdErr = $previewStdErr
        probeScript = $probeScriptPath
        probeStdOut = $probeStdOutPath
        probeStdErr = $probeStdErrPath
    }
    logs = $script:LogLines
}

$manifest = [ordered]@{
    phase = "2.2"
    category = "runtime"
    runStamp = $RunStamp
    generatedAt = (Get-Date).ToString("o")
    contract = $summary.contract
    guaranteed = $guaranteed
    exportedRuntimeContract = $exportedRuntimeContract
    nullable = $nullable
    exports = $exportsSummary
    nextPhaseCandidates = $nextPhaseCandidates
    artifacts = @(
        (Split-Path -Leaf $txtPath),
        (Split-Path -Leaf $jsonPath),
        (Split-Path -Leaf $summaryPath),
        (Split-Path -Leaf $manifestPath),
        (Split-Path -Leaf $previewStdOut),
        (Split-Path -Leaf $previewStdErr),
        (Split-Path -Leaf $probeScriptPath),
        (Split-Path -Leaf $probeStdOutPath),
        (Split-Path -Leaf $probeStdErrPath)
    )
}

Set-Content -LiteralPath $txtPath -Value ($script:LogLines -join "`r`n") -Encoding UTF8
($payload | ConvertTo-Json -Depth 100) | Set-Content -LiteralPath $jsonPath -Encoding UTF8
($summary | ConvertTo-Json -Depth 50) | Set-Content -LiteralPath $summaryPath -Encoding UTF8
($manifest | ConvertTo-Json -Depth 50) | Set-Content -LiteralPath $manifestPath -Encoding UTF8

$latestPublished = Publish-Latest -RunDir $runDir -LatestDir $latestDir -BaseDir $baseDir -KeepCount $Keep

if ($exitCode -eq 0) {
    Write-Host ("[OK] audit runtime => {0}" -f $latestPublished) -ForegroundColor Green
    exit 0
}
elseif ($exitCode -eq 2) {
    Write-Host ("[OK] audit runtime (warn) => {0}" -f $latestPublished) -ForegroundColor Yellow
    exit 2
}
else {
    Write-Host ("[KO] audit runtime => {0}" -f $latestPublished) -ForegroundColor Red
    exit 1
}