[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$RepoRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) { $RepoRoot = (Get-Location).Path }
if (-not (Test-Path -LiteralPath $RepoRoot)) { throw "RepoRoot not found: $RepoRoot" }

Write-Host "[reset-deps] RepoRoot: $RepoRoot"

# 1) stop processes that can lock node_modules
$names = @("node", "vite", "vercel")
Get-Process -ErrorAction SilentlyContinue |
Where-Object { $names -contains $_.Name } |
ForEach-Object {
    Write-Host ("[reset-deps] Stop process: {0} (pid={1})" -f $_.Name, $_.Id)
    try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch {}
}

Start-Sleep -Seconds 1

Push-Location $RepoRoot
try {
    # 2) remove node_modules
    if (Test-Path -LiteralPath ".\node_modules") {
        Write-Host "[reset-deps] Remove node_modules (PowerShell)..."
        try {
            Remove-Item -Recurse -Force ".\node_modules" -ErrorAction Stop
        }
        catch {
            Write-Host "[reset-deps] PowerShell Remove-Item failed, fallback rmdir..."
            cmd /c rmdir /s /q node_modules | Out-Null
        }
    }

    # 3) npm ci
    Write-Host "[reset-deps] npm cache verify"
    npm cache verify | Out-Host

    Write-Host "[reset-deps] npm ci --no-audit --no-fund"
    npm ci --no-audit --no-fund | Out-Host

    # 4) sanity check
    Write-Host "[reset-deps] check toolchain"
    npx --no-install tsc --version | Out-Host
    npx --no-install vitest --version | Out-Host
    npx --no-install vite --version | Out-Host

    Write-Host "[reset-deps] OK"
}
finally {
    Pop-Location
}
