Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-GitInfo([string]$RepoRoot) {
    $info = [ordered]@{
        branch = ""
        head = ""
        statusShort = ""
        diffstat = ""
    }
    try {
        $info.branch = (git -C $RepoRoot rev-parse --abbrev-ref HEAD) 2>$null
        $info.head = (git -C $RepoRoot rev-parse HEAD) 2>$null
        $info.statusShort = (git -C $RepoRoot status -sb) 2>$null
        $info.diffstat = (git -C $RepoRoot diff --stat) 2>$null
    } catch {}
    return $info
}

Export-ModuleMember -Function Get-GitInfo
