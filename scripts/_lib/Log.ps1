Set-StrictMode -Version Latest

$script:LogFilePath = $null

function Ensure-Dir {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return }
    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Force -Path $Path | Out-Null
    }
}

function Set-LogFile {
    [CmdletBinding()]
    param(
        [string]$Path = "",
        [switch]$Reset
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        $script:LogFilePath = $null
        return
    }

    Ensure-Dir (Split-Path -Parent $Path)
    if ($Reset) {
        Set-Content -LiteralPath $Path -Value "" -Encoding UTF8
    }

    $script:LogFilePath = $Path
}

function New-LogState {
    [CmdletBinding()]
    param()
    return [pscustomobject]@{
        Lines     = New-Object System.Collections.Generic.List[string]
        WarnCount = 0
        ErrCount  = 0
    }
}

function Write-LogLine {
    param(
        [object]$State,
        [string]$Level,
        [string]$Message,
        [ConsoleColor]$Color
    )

    $line = "[{0}] {1}" -f $Level, $Message

    if ($null -ne $State -and $State.Lines) {
        $State.Lines.Add($line) | Out-Null
    }

    if ($script:LogFilePath) {
        Add-Content -LiteralPath $script:LogFilePath -Value $line -Encoding UTF8
    }

    if ($Level -eq "INFO") { Write-Verbose $line }
    else { Write-Host $line -ForegroundColor $Color }
}

function Write-LogFile {
    [CmdletBinding()]
    param(
        [object]$State,
        [string]$Path
    )

    if ($null -eq $State -or -not $State.Lines) { return }
    Ensure-Dir (Split-Path -Parent $Path)
    Set-Content -LiteralPath $Path -Value ($State.Lines -join "`r`n") -Encoding UTF8
}

function Info([object]$State, [string]$Message) { Write-LogLine $State "INFO" $Message ([ConsoleColor]::Gray) }
function Ok  ([object]$State, [string]$Message) { Write-LogLine $State "OK"   $Message ([ConsoleColor]::Green) }
function Warn([object]$State, [string]$Message) { if ($null -ne $State) { $State.WarnCount++ }; Write-LogLine $State "WARN" $Message ([ConsoleColor]::Yellow) }
function Err ([object]$State, [string]$Message) { if ($null -ne $State) { $State.ErrCount++ }; Write-LogLine $State "ERR"  $Message ([ConsoleColor]::Red) }

function Invoke-Step {
    [CmdletBinding()]
    param(
        [object]$State,
        [string]$Name,
        [scriptblock]$Command,
        [string]$LogPath,
        [int[]]$WarnExitCodes = @()
    )

    if ($LogPath) {
        Ensure-Dir (Split-Path -Parent $LogPath)
        Set-Content -LiteralPath $LogPath -Value ("[INFO] step {0} started {1}" -f $Name, (Get-Date -Format o)) -Encoding UTF8
    }

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $exitCode = 0

    try {
        & $Command 2>&1 | Tee-Object -FilePath $LogPath -Append | Out-Host
        $exitCode = $LASTEXITCODE
    }
    catch {
        $exitCode = 1
        ($_ | Out-String) | Tee-Object -FilePath $LogPath -Append | Out-Host
    }
    finally {
        $sw.Stop()
    }

    $status = "ERR"
    if ($exitCode -eq 0) { $status = "OK" }
    elseif ($WarnExitCodes -contains $exitCode) { $status = "WARN" }

    if ($status -eq "OK") { Ok   $State "step $Name OK (exit=$exitCode)" }
    elseif ($status -eq "WARN") { Warn $State "step $Name WARN (exit=$exitCode)" }
    else { Err  $State "step $Name ERR (exit=$exitCode)" }

    return [pscustomobject]@{
        Name       = $Name
        ExitCode   = $exitCode
        DurationMs = [Math]::Round($sw.Elapsed.TotalMilliseconds, 0)
        Status     = $status
        LogPath    = $LogPath
    }
}
