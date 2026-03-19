param(
  [string]$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [int[]]$Ports = @(3000, 5173)
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Write-Host "`n=== STOP REPO PROCESSES ===" -ForegroundColor Cyan

Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -like "*$Repo*" -and $_.Name -match 'node|npm|cmd'
  } |
  ForEach-Object {
    try {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
      Write-Host ("Stopped PID {0}" -f $_.ProcessId) -ForegroundColor Yellow
    } catch {
      Write-Warning $_
    }
  }

Start-Sleep -Seconds 2

Write-Host "`n=== PORT CHECK ===" -ForegroundColor Cyan
foreach ($port in $Ports) {
  Test-NetConnection 127.0.0.1 -Port $port -WarningAction SilentlyContinue |
    Select-Object ComputerName, RemotePort, TcpTestSucceeded |
    Format-List
}
