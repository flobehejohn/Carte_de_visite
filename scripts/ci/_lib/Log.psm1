Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:LogPath = $null

function Set-LogPath([string]$Path) {
    $script:LogPath = $Path
}

function Write-Log([string]$Level, [string]$Message) {
    $line = "[{0}] {1}" -f $Level.ToUpperInvariant(), $Message
    Write-Host $line
    if ($script:LogPath) {
        Add-Content -LiteralPath $script:LogPath -Value $line -Encoding UTF8
    }
}

function Start-Step([string]$Name) {
    return [ordered]@{
        Name = $Name
        Start = Get-Date
        Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    }
}

function Stop-Step([hashtable]$Step, [string]$Status, [int]$ExitCode, [string]$LogFile = "") {
    $Step.Stopwatch.Stop()
    $durationMs = [int]$Step.Stopwatch.ElapsedMilliseconds
    return [ordered]@{
        Name = $Step.Name
        Status = $Status
        ExitCode = $ExitCode
        DurationMs = $durationMs
        LogFile = $LogFile
    }
}

Export-ModuleMember -Function Set-LogPath, Write-Log, Start-Step, Stop-Step
