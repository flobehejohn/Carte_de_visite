param(
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Log([string]$msg) { Write-Host "[smoke-mime] $msg" }

$BaseUrl = $BaseUrl.TrimEnd("/")
$u = "$BaseUrl/@vite/client"

try {
  $headers = @{
    "Accept" = "*/*"
    "Range"  = "bytes=0-0"
  }

  $resp = Invoke-WebRequest -Uri $u -Method Get -Headers $headers -TimeoutSec 20 -SkipHttpErrorCheck
  $ct = $resp.Headers["Content-Type"]

  Log "/@vite/client Content-Type: $ct"

  if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400 -and ($ct -match "javascript|ecmascript|module")) {
    Log "OK: /@vite/client served as JS"
    exit 0
  }

  Log "FAIL: /@vite/client not JS (rewrite/proxy suspect)"
  exit 1
}
catch {
  Log "FAIL: exception: $($_.Exception.Message)"
  exit 1
}
