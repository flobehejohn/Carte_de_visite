Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-JsonAtomic([string]$Path, [object]$Object) {
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $tmp = Join-Path $dir ("." + [IO.Path]::GetFileName($Path) + ".tmp")
    $json = $Object | ConvertTo-Json -Depth 10
    Set-Content -LiteralPath $tmp -Value $json -Encoding UTF8
    Move-Item -LiteralPath $tmp -Destination $Path -Force
}

function SafeConvert([object]$Object) {
    try { return ($Object | ConvertTo-Json -Depth 10) } catch { return "{}" }
}

Export-ModuleMember -Function Write-JsonAtomic, SafeConvert
