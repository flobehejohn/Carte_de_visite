[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -ge 7) {
  $PSNativeCommandUseErrorActionPreference = $true
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$knowledgeDir = Join-Path $repoRoot 'src/server/knowledge'
$manifestPath = Join-Path $knowledgeDir 'zarathoustra.manifest.json'

$fileNames = @(
  'zarathoustra.sentences.tagged.json',
  'zarathoustra.structure.json',
  'zarathoustra.txt',
  'zarathoustra.clean.txt',
  'zarathoustra.sentences.json',
  'zarathoustra.sentences.misses.log'
)

$textExtensions = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
@('.json', '.txt', '.log', '.md', '.csv', '.tsv', '.yml', '.yaml') | ForEach-Object {
  [void]$textExtensions.Add($_)
}

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function Get-Sha256Hex {
  param(
    [Parameter(Mandatory = $true)]
    [byte[]]$Bytes
  )

  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hash = $sha.ComputeHash($Bytes)
    return ([System.BitConverter]::ToString($hash)).Replace('-', '').ToLowerInvariant()
  }
  finally {
    $sha.Dispose()
  }
}

function Get-CanonicalBytes {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $raw = [System.IO.File]::ReadAllBytes($Path)
  $ext = [System.IO.Path]::GetExtension($Path)

  if (-not $textExtensions.Contains($ext)) {
    return $raw
  }

  $text = [System.Text.Encoding]::UTF8.GetString($raw)

  if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) {
    $text = $text.Substring(1)
  }

  $text = $text -replace "`r`n?", "`n"
  return $utf8NoBom.GetBytes($text)
}

if (-not (Test-Path -LiteralPath $knowledgeDir)) {
  throw "Dossier knowledge introuvable : $knowledgeDir"
}

$files = foreach ($name in $fileNames) {
  $filePath = Join-Path $knowledgeDir $name

  if (-not (Test-Path -LiteralPath $filePath)) {
    throw "Fichier corpus introuvable : $filePath"
  }

  $bytes = Get-CanonicalBytes -Path $filePath
  $sha256 = Get-Sha256Hex -Bytes $bytes

  [ordered]@{
    name = $name
    sha256 = $sha256
    bytes = $bytes.Length
  }
}

$manifest = [ordered]@{
  generatedAt = (Get-Date).ToString('o')
  knowledgeDir = 'src/server/knowledge'
  files = $files
}

$json = $manifest | ConvertTo-Json -Depth 10
$json = $json -replace "`r`n?", "`n"

if (-not $json.EndsWith("`n")) {
  $json += "`n"
}

[System.IO.File]::WriteAllText($manifestPath, $json, $utf8NoBom)

Write-Host "[knowledge] Manifest refreshed: $manifestPath" -ForegroundColor Green