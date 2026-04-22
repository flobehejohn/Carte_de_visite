param(
  [string]$BaseUrl = 'http://127.0.0.1:4173'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Step {
  param(
    [string]$Message
  )

  $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'), $Message
  Write-Host $line
  Add-Content -Path $script:DriverLog -Value $line
}

function Wait-HttpReady {
  param(
    [string]$Url,
    [int]$Attempts = 60,
    [int]$DelayMs = 500
  )

  for ($i = 0; $i -lt $Attempts; $i++) {
    try {
      Invoke-WebRequest $Url -UseBasicParsing -Method GET | Out-Null
      return $true
    } catch {
      Start-Sleep -Milliseconds $DelayMs
    }
  }

  return $false
}

$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Repo

$Ts = Get-Date -Format 'yyyyMMdd_HHmmss'
$AuditDir = Join-Path $Repo "audit\_latest\particle_flicker_trace_$Ts"
New-Item -ItemType Directory -Force -Path $AuditDir | Out-Null

$script:DriverLog = Join-Path $AuditDir 'pwsh-driver.log'
New-Item -ItemType File -Force -Path $script:DriverLog | Out-Null

$env:VITE_ENABLE_ORB_AUDIT = 'true'
$env:ORB_FLICKER_AUDIT_URL = $BaseUrl
$env:ORB_FLICKER_AUDIT_OUTDIR = $AuditDir
$env:CI = '1'

Write-Step "Repo=$Repo"
Write-Step "AuditDir=$AuditDir"
Write-Step "BaseUrl=$BaseUrl"

try {
  Write-Step "node version"
  node -v 2>&1 | Tee-Object -FilePath (Join-Path $AuditDir 'node-version.log') | Out-Null

  Write-Step "npm version"
  npm -v 2>&1 | Tee-Object -FilePath (Join-Path $AuditDir 'npm-version.log') | Out-Null

  Write-Step "playwright version"
  & .\node_modules\.bin\playwright.cmd --version 2>&1 |
    Tee-Object -FilePath (Join-Path $AuditDir 'playwright-version.log') | Out-Null

  Write-Step "runner syntax check:start"
  node --check .\scripts\run-playwright-flicker-audit.cjs 2>&1 |
    Tee-Object -FilePath (Join-Path $AuditDir 'runner-syntax.log') | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Step "runner syntax check:failed exit=$LASTEXITCODE"
    throw "Syntaxe invalide dans run-playwright-flicker-audit.cjs ($LASTEXITCODE)"
  }
  Write-Step "runner syntax check:ok"

  Write-Step "build:start"
  npm run build 2>&1 | Tee-Object -FilePath (Join-Path $AuditDir 'build.log')
  if ($LASTEXITCODE -ne 0) {
    Write-Step "build:failed exit=$LASTEXITCODE"
    throw "Build failed ($LASTEXITCODE)"
  }
  Write-Step "build:ok"

  Write-Step "playwright-install:start"
  & .\node_modules\.bin\playwright.cmd install chromium firefox 2>&1 |
    Tee-Object -FilePath (Join-Path $AuditDir 'playwright-install.log')
  if ($LASTEXITCODE -ne 0) {
    Write-Step "playwright-install:failed exit=$LASTEXITCODE"
    throw "playwright install chromium firefox failed ($LASTEXITCODE)"
  }
  Write-Step "playwright-install:ok"

  Write-Step "preview:start"
  $Preview = Start-Process `
    -FilePath node `
    -ArgumentList '.\node_modules\vite\bin\vite.js','preview','--host','127.0.0.1','--port','4173' `
    -WorkingDirectory $Repo `
    -RedirectStandardOutput (Join-Path $AuditDir 'vite-preview.stdout.log') `
    -RedirectStandardError  (Join-Path $AuditDir 'vite-preview.stderr.log') `
    -PassThru
  Write-Step "preview:pid=$($Preview.Id)"

  try {
    $Ready = Wait-HttpReady -Url $BaseUrl -Attempts 60 -DelayMs 500

    if (-not $Ready) {
      Write-Step "preview:not-ready"
      throw "vite preview indisponible sur $BaseUrl"
    }
    Write-Step "preview:ready"

    $RunnerStdOut = Join-Path $AuditDir 'runner.stdout.log'
    $RunnerStdErr = Join-Path $AuditDir 'runner.stderr.log'

    Write-Step "runner:start"
    $RunnerCmd = 'node ".\scripts\run-playwright-flicker-audit.cjs" 1>"' + $RunnerStdOut + '" 2>"' + $RunnerStdErr + '"'
    cmd.exe /d /c $RunnerCmd
    $RunnerExit = $LASTEXITCODE
    Write-Step "runner:exit=$RunnerExit"

    Write-Step "auditDir:list"
    Get-ChildItem $AuditDir -File |
      Sort-Object LastWriteTime |
      Select-Object Name, Length, LastWriteTime |
      Format-Table -AutoSize |
      Out-String |
      Tee-Object -FilePath (Join-Path $AuditDir 'auditdir-list.txt') | Out-Null

    $Checks = @(
      'runner-start.txt',
      'runner-phase.txt',
      'playwright-flicker-manifest.json',
      'chromium-particle-flicker-report.json',
      'chromium-particle-flicker-report.txt',
      'firefox-particle-flicker-report.json',
      'firefox-particle-flicker-report.txt',
      'playwright-chromium.log',
      'playwright-firefox.log',
      'runner.stdout.log',
      'runner.stderr.log'
    )

    foreach ($name in $Checks) {
      $exists = Test-Path (Join-Path $AuditDir $name)
      Write-Step ("artifact:{0}={1}" -f $name, $exists)
    }

    if ($RunnerExit -ne 0) {
      Write-Step "runner:failed"
      throw "run-playwright-flicker-audit.cjs failed ($RunnerExit)"
    }

    foreach ($name in $Checks) {
      $path = Join-Path $AuditDir $name
      if (-not (Test-Path $path)) {
        Write-Step "missing:$name"
        throw "Artefact manquant : $name"
      }
    }

    Write-Step "runner:validated"
    Write-Step "chromium:report"
    Get-Content (Join-Path $AuditDir 'chromium-particle-flicker-report.txt')
    Write-Step "firefox:report"
    Get-Content (Join-Path $AuditDir 'firefox-particle-flicker-report.txt')
  }
  finally {
    if ($Preview -and -not $Preview.HasExited) {
      Stop-Process -Id $Preview.Id -Force
      Write-Step "preview:stopped"
    }
  }
}
catch {
  Write-Step ("fatal=" + $_.Exception.Message)
  throw
}
