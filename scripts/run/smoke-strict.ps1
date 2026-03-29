[CmdletBinding()]
param(
  [string]$Base = "http://127.0.0.1:3000",
  [int]$TimeoutSec = 60
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-Json([string]$Url, [string]$BodyJson) {
  try {
    $resp = Invoke-WebRequest $Url -Method Post -ContentType "application/json" -Body $BodyJson -TimeoutSec $TimeoutSec
    return @{ ok=$true; status=[int]$resp.StatusCode; json=($resp.Content | ConvertFrom-Json) }
  } catch {
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $content = $reader.ReadToEnd()
      $reader.Close()
      return @{ ok=$false; status=$status; json=($content | ConvertFrom-Json) }
    }
    return @{ ok=$false; status=0; error="NO_SERVER_OR_CONNECTION_REFUSED"; detail=$_.Exception.Message }
  }
}

$bodyOk = @{
  mode="oracle"
  prompt="Rituel: prouve que tu utilises le corpus Zarathoustra. Cite au moins 2 extraits."
  expectJson=$true
  wantCitations=$true
  minCitations=2
  temperature=0.2
} | ConvertTo-Json -Depth 10

$r1 = Invoke-Json "$Base/api/gemini" $bodyOk
$r1 | ConvertTo-Json -Depth 12

$bodyKo = @{
  mode="oracle"
  prompt="Rituel: prouve corpus Zarathoustra. Cite 2 extraits."
  expectJson=$true
  wantCitations=$true
  minCitations=64
  temperature=0.2
} | ConvertTo-Json -Depth 10

$r2 = Invoke-Json "$Base/api/gemini" $bodyKo
$r2 | ConvertTo-Json -Depth 12