Set-StrictMode -Version Latest

$script:LogFilePath = $null

function New-LogState {
    [CmdletBinding()]
    param()
    return [pscustomobject]@{
        Lines     = New-Object System.Collections.Generic.List[string]
        WarnCount = 0
        ErrCount  = 0
    }
}

function Set-LogFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [switch]$Reset
    )
    $dir = Split-Path -Parent $Path
    if (-not [string]::IsNullOrWhiteSpace($dir) -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    $script:LogFilePath = $Path
    if ($Reset -and (Test-Path -LiteralPath $Path)) {
        Remove-Item -Force -LiteralPath $Path
    }
}

function Write-LogLine {
    [CmdletBinding()]
    param(
        [object]$State,
        [string]$Level,
        [string]$Message,
        [ConsoleColor]$Color = [ConsoleColor]::Gray
    )

    $line = "[{0}] {1}" -f $Level, $Message

    if ($null -ne $State -and $State.Lines) {
        $State.Lines.Add($line) | Out-Null
    }

    if ($script:LogFilePath) {
        try { Add-Content -LiteralPath $script:LogFilePath -Value $line -Encoding UTF8 } catch { }
    }

    if ($Level -eq "INFO") { Write-Verbose $line }
    else { Write-Host $line -ForegroundColor $Color }
}

function Info ([object]$State, [string]$Message) { Write-LogLine $State "INFO" $Message ([ConsoleColor]::Gray) }
function Ok   ([object]$State, [string]$Message) { Write-LogLine $State "OK"   $Message ([ConsoleColor]::Green) }
function Warn ([object]$State, [string]$Message) { if ($null -ne $State) { $State.WarnCount++ }; Write-LogLine $State "WARN" $Message ([ConsoleColor]::Yellow) }
function Err  ([object]$State, [string]$Message) { if ($null -ne $State) { $State.ErrCount++  }; Write-LogLine $State "ERR"  $Message ([ConsoleColor]::Red) }

function Write-LogFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [object]$State,
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $dir = Split-Path -Parent $Path
    if (-not [string]::IsNullOrWhiteSpace($dir) -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }

    if ($null -eq $State -or -not $State.Lines) {
        Set-Content -LiteralPath $Path -Value "" -Encoding UTF8
        return
    }

    Set-Content -LiteralPath $Path -Value ($State.Lines -join "`r`n") -Encoding UTF8
}

function Invoke-Step {
    <#
      ULTRA déterministe:
        - ne dépend jamais de $?
        - reset LASTEXITCODE avant exécution
        - redirige *tous* les streams via *> (sans pipe), donc pas de "faux OK"
        - si exception PowerShell => exit=1
        - si aucun natif appelé => LASTEXITCODE reste 0 (car reset)
        - WARN si exit dans WarnExitCodes
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [object]$State,

        [Parameter(Mandatory = $true)]
        [string]$Name,

        [string]$LogPath = "",

        [int[]]$WarnExitCodes = @(),

        [switch]$Quiet,

        [Parameter(Mandatory = $true)]
        [scriptblock]$Command
    )

    $start = Get-Date
    $exitCode = 1
    $status = "ERR"
    $errMsg = $null

    if (-not [string]::IsNullOrWhiteSpace($LogPath)) {
        $logDir = Split-Path -Parent $LogPath
        if (-not [string]::IsNullOrWhiteSpace($logDir) -and -not (Test-Path -LiteralPath $logDir)) {
            New-Item -ItemType Directory -Force -Path $logDir | Out-Null
        }
        if (Test-Path -LiteralPath $LogPath) { Remove-Item -Force -LiteralPath $LogPath }
    }

    try {
        $global:LASTEXITCODE = 0

        if ([string]::IsNullOrWhiteSpace($LogPath)) {
            & $Command | Out-Null
        } else {
            # Redirection "*>": capture stdout/stderr/verbose/warning/info/debug en fichier
            & $Command *> $LogPath
        }

        $exitCode = [int]$global:LASTEXITCODE

        if ($exitCode -eq 0) { $status = "OK" }
        elseif ($WarnExitCodes -and ($WarnExitCodes -contains $exitCode)) { $status = "WARN" }
        else { $status = "ERR" }
    }
    catch {
        $exitCode = 1
        $status = "ERR"
        $errMsg = $_.Exception.Message

        if (-not [string]::IsNullOrWhiteSpace($LogPath)) {
            try {
                Add-Content -LiteralPath $LogPath -Value ("`n[EXCEPTION] {0}" -f $errMsg) -Encoding UTF8
                if ($_.InvocationInfo) {
                    Add-Content -LiteralPath $LogPath -Value ("[POSITION] {0}" -f $_.InvocationInfo.PositionMessage) -Encoding UTF8
                }
            } catch { }
        }
    }

    $durMs = [int]([Math]::Round(((Get-Date) - $start).TotalMilliseconds, 0))

    if ($status -eq "OK") { Ok   $State ("step {0} OK (exit={1})" -f $Name, $exitCode) }
    elseif ($status -eq "WARN") { Warn $State ("step {0} WARN (exit={1})" -f $Name, $exitCode) }
    else {
        if ($errMsg) { Err $State ("step {0} ERR (exit={1}) :: {2}" -f $Name, $exitCode, $errMsg) }
        else { Err $State ("step {0} ERR (exit={1})" -f $Name, $exitCode) }
    }

    return [pscustomobject]@{
        Name       = $Name
        ExitCode   = $exitCode
        Status     = $status
        DurationMs = $durMs
        LogPath    = $LogPath
    }
}
