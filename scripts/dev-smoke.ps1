[CmdletBinding()]
param(
    [string]$BaseUrl = "http://127.0.0.1:3000"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$smMime = Join-Path $ScriptDir "smoke-mime.ps1"
$smApi = Join-Path $ScriptDir "smoke-api.ps1"

pwsh -NoProfile -ExecutionPolicy Bypass -File $smMime -BaseUrl $BaseUrl
pwsh -NoProfile -ExecutionPolicy Bypass -File $smApi -BaseUrl $BaseUrl -Prompt "Rituel: je franchis le seuil et je cite Zarathoustra." -TimeoutSec 60 -RequireCitations
