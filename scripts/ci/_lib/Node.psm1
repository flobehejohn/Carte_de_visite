Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-NodeInfo {
    $os = [ordered]@{
        platform = $env:OS
        version = [System.Environment]::OSVersion.VersionString
    }
    $node = (node --version) 2>$null
    $npm = (npm --version) 2>$null
    $pwsh = $PSVersionTable.PSVersion.ToString()
    return [ordered]@{
        node = ($node -join "").Trim()
        npm = ($npm -join "").Trim()
        pwsh = $pwsh
        os = $os
    }
}

function Hash-Lockfile([string]$RepoRoot) {
    $lock = Join-Path $RepoRoot "package-lock.json"
    if (-not (Test-Path -LiteralPath $lock)) { return "" }
    return (Get-FileHash -LiteralPath $lock -Algorithm SHA256).Hash
}

Export-ModuleMember -Function Get-NodeInfo, Hash-Lockfile
