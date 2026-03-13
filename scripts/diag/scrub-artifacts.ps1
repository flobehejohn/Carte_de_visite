# scripts/diag/scrub-artifacts.ps1
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  # Dossier principal d'artefacts (par défaut: <repo>/artifacts)
  [string]$ArtifactsDir = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path 'artifacts'),

  # Dossiers additionnels à gérer (ex: audit/_latest) - chemins relatifs au repo ou absolus
  [string[]]$ExtraDirs = @('audit/_latest'),

  # Active le scrub (redaction des secrets)
  [switch]$Scrub = $true,

  # Active la purge (caps)
  [switch]$Prune = $true,

  # Cap par nombre de fichiers (0 = désactivé)
  [int]$ArtifactsCapFiles = 300,
  [int]$ExtraCapFiles = 40,          # cap appliqué à chaque ExtraDir

  # Cap par taille totale en MB (0 = désactivé)
  [int]$ArtifactsCapMB = 0,
  [int]$ExtraCapMB = 0,

  # Purge des fichiers plus vieux que N jours (0 = désactivé)
  [int]$KeepDays = 0,

  # Ignore certaines extensions (artefacts binaires, etc.)
  [string[]]$IgnoreExtensions = @(
    '.png','.jpg','.jpeg','.gif','.webp',
    '.zip','.7z','.rar','.gz','.tar',
    '.mp3','.wav','.mp4','.mov',
    '.pdf','.exe','.dll','.pdb','.bin',
    '.woff','.woff2','.ttf','.otf'
  )
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------
# Logging helpers
# ---------------------------
function Info([string]$m) { Write-Host "[info] $m" -ForegroundColor Cyan }
function Ok([string]$m)   { Write-Host "[ok]   $m" -ForegroundColor Green }
function Warn([string]$m) { Write-Host "[warn] $m" -ForegroundColor Yellow }
function Err([string]$m)  { Write-Host "[err]  $m" -ForegroundColor Red }

function Get-RepoRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

function Resolve-Dir([string]$p) {
  if ([string]::IsNullOrWhiteSpace($p)) { return $null }
  if (Test-Path -LiteralPath $p) { return (Resolve-Path -LiteralPath $p).Path }

  $repo = Get-RepoRoot
  $candidate = Join-Path $repo $p
  if (Test-Path -LiteralPath $candidate) { return (Resolve-Path -LiteralPath $candidate).Path }

  return $p # laissé tel quel (peut être créé plus tard)
}

function Is-IgnoredExt([string]$path) {
  $ext = [IO.Path]::GetExtension($path)
  if ([string]::IsNullOrWhiteSpace($ext)) { return $false }
  return $IgnoreExtensions -contains $ext.ToLowerInvariant()
}

function Try-ReadText([string]$path) {
  # Retourne $null si binaire / illisible
  try {
    # Lecture brute bytes pour détecter binaire (0x00)
    $bytes = [IO.File]::ReadAllBytes($path)
    if ($bytes.Length -eq 0) { return "" }

    # heuristique binaire: présence de null byte
    if ($bytes -contains 0) { return $null }

    # decode UTF8/ANSI tolérant
    return [Text.Encoding]::UTF8.GetString($bytes)
  } catch {
    return $null
  }
}

function Write-TextUtf8NoBom([string]$path, [string]$content) {
  $enc = New-Object System.Text.UTF8Encoding($false) # no BOM
  [IO.File]::WriteAllText($path, $content, $enc)
}

# ---------------------------
# Scrub rules (artefacts ONLY)
# ---------------------------
# NOTE: on reste volontairement conservateur pour éviter les faux positifs.
$rules = @(
  @{ name='vercel_token';        pattern='vcp_[A-Za-z0-9_\-]+';               replace='vcp_[REDACTED]' },
  @{ name='google_api_key';      pattern='AIza[0-9A-Za-z\-_]{20,}';           replace='AIza[REDACTED]' },
  @{ name='private_key_block';   pattern='-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA )?PRIVATE KEY-----'; replace='-----BEGIN PRIVATE KEY-----[REDACTED]-----END PRIVATE KEY-----' }
)

function Scrub-Dir([string]$dir) {
  if (-not (Test-Path -LiteralPath $dir)) {
    Warn "Scrub: dossier introuvable: $dir"
    return @{ scanned = 0; scrubbed = 0; skipped = 0 }
  }

  $files = Get-ChildItem -LiteralPath $dir -Recurse -File -ErrorAction SilentlyContinue
  $scanned = 0
  $scrubbed = 0
  $skipped = 0

  foreach ($f in $files) {
    $scanned++

    if (Is-IgnoredExt $f.FullName) { $skipped++; continue }

    $text = Try-ReadText $f.FullName
    if ($null -eq $text) { $skipped++; continue }

    if ($text.Length -eq 0) { continue }

    $orig = $text
    foreach ($r in $rules) {
      $text = [regex]::Replace($text, $r.pattern, $r.replace)
    }

    if ($text -ne $orig) {
      $scrubbed++
      if ($PSCmdlet.ShouldProcess($f.FullName, "Scrub secrets")) {
        Write-TextUtf8NoBom -path $f.FullName -content $text
        Info "scrubbed: $($f.FullName)"
      }
    }
  }

  return @{ scanned = $scanned; scrubbed = $scrubbed; skipped = $skipped }
}

# ---------------------------
# Prune helpers
# ---------------------------
function Remove-EmptyDirs([string]$dir) {
  if (-not (Test-Path -LiteralPath $dir)) { return }
  Get-ChildItem -LiteralPath $dir -Recurse -Directory -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | # bottom-up
    ForEach-Object {
      $hasAny = Get-ChildItem -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue | Select-Object -First 1
      if (-not $hasAny) {
        if ($PSCmdlet.ShouldProcess($_.FullName, "Remove empty directory")) {
          Remove-Item -LiteralPath $_.FullName -Force -Recurse -ErrorAction SilentlyContinue
        }
      }
    }
}

function Prune-Dir([string]$dir, [int]$capFiles, [int]$capMB, [int]$keepDays) {
  if (-not (Test-Path -LiteralPath $dir)) {
    Warn "Prune: dossier introuvable: $dir"
    return @{ before = 0; after = 0; deleted = 0; freedBytes = 0 }
  }

  $all = Get-ChildItem -LiteralPath $dir -Recurse -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending

  $before = $all.Count
  $deleted = 0
  $freed = [int64]0

  # 1) Age-based prune
  if ($keepDays -gt 0) {
    $cutoff = (Get-Date).AddDays(-$keepDays)
    $old = $all | Where-Object { $_.LastWriteTime -lt $cutoff }
    foreach ($f in $old) {
      if ($PSCmdlet.ShouldProcess($f.FullName, "Remove old file (>$keepDays days)")) {
        $size = $f.Length
        Remove-Item -LiteralPath $f.FullName -Force -ErrorAction SilentlyContinue
        $deleted++
        $freed += $size
      }
    }

    # refresh
    $all = Get-ChildItem -LiteralPath $dir -Recurse -File -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending
  }

  # 2) Cap by file count (keep newest)
  if ($capFiles -gt 0 -and $all.Count -gt $capFiles) {
    $toDel = $all | Select-Object -Skip $capFiles
    foreach ($f in $toDel) {
      if ($PSCmdlet.ShouldProcess($f.FullName, "Remove (capFiles=$capFiles)")) {
        $size = $f.Length
        Remove-Item -LiteralPath $f.FullName -Force -ErrorAction SilentlyContinue
        $deleted++
        $freed += $size
      }
    }

    $all = Get-ChildItem -LiteralPath $dir -Recurse -File -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending
  }

  # 3) Cap by total size MB (delete oldest until under cap)
  if ($capMB -gt 0) {
    $capBytes = [int64]$capMB * 1024 * 1024
    $total = ($all | Measure-Object -Property Length -Sum).Sum
    if ($total -gt $capBytes) {
      # delete oldest first -> sort ascending by LastWriteTime
      $oldestFirst = $all | Sort-Object LastWriteTime -Ascending
      foreach ($f in $oldestFirst) {
        if ($total -le $capBytes) { break }
        if ($PSCmdlet.ShouldProcess($f.FullName, "Remove (capMB=$capMB)")) {
          $size = $f.Length
          Remove-Item -LiteralPath $f.FullName -Force -ErrorAction SilentlyContinue
          $deleted++
          $freed += $size
          $total -= $size
        }
      }
    }
  }

  Remove-EmptyDirs $dir

  $after = 0
  if (Test-Path -LiteralPath $dir) {
    $after = (Get-ChildItem -LiteralPath $dir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
  }

  return @{ before = $before; after = $after; deleted = $deleted; freedBytes = $freed }
}

# ---------------------------
# Main
# ---------------------------
$repoRoot = Get-RepoRoot
$resolvedArtifacts = Resolve-Dir $ArtifactsDir
$resolvedExtras = @($ExtraDirs | ForEach-Object { Resolve-Dir $_ })

Info "RepoRoot: $repoRoot"
Info "ArtifactsDir: $resolvedArtifacts"
if ($resolvedExtras.Count -gt 0) { Info ("ExtraDirs: " + ($resolvedExtras -join ", ")) }

$summary = @{
  scrub_scanned = 0
  scrubbed = 0
  scrub_skipped = 0
  prune_deleted = 0
  prune_freedBytes = [int64]0
}

try {
  if ($Scrub) {
    Info "Scrub: start"

    $r1 = Scrub-Dir $resolvedArtifacts
    $summary.scrub_scanned += $r1.scanned
    $summary.scrubbed += $r1.scrubbed
    $summary.scrub_skipped += $r1.skipped

    foreach ($d in $resolvedExtras) {
      $rX = Scrub-Dir $d
      $summary.scrub_scanned += $rX.scanned
      $summary.scrubbed += $rX.scrubbed
      $summary.scrub_skipped += $rX.skipped
    }

    Ok "Scrub: done scanned=$($summary.scrub_scanned) scrubbed=$($summary.scrubbed) skipped=$($summary.scrub_skipped)"
  } else {
    Warn "Scrub: disabled"
  }

  if ($Prune) {
    Info "Prune: start"

    $p1 = Prune-Dir -dir $resolvedArtifacts -capFiles $ArtifactsCapFiles -capMB $ArtifactsCapMB -keepDays $KeepDays
    $summary.prune_deleted += $p1.deleted
    $summary.prune_freedBytes += $p1.freedBytes
    Ok "Prune artifacts: before=$($p1.before) after=$($p1.after) deleted=$($p1.deleted) freedBytes=$($p1.freedBytes)"

    foreach ($d in $resolvedExtras) {
      $pX = Prune-Dir -dir $d -capFiles $ExtraCapFiles -capMB $ExtraCapMB -keepDays $KeepDays
      $summary.prune_deleted += $pX.deleted
      $summary.prune_freedBytes += $pX.freedBytes
      Ok "Prune extra: $d  before=$($pX.before) after=$($pX.after) deleted=$($pX.deleted) freedBytes=$($pX.freedBytes)"
    }

    Ok "Prune: done deleted=$($summary.prune_deleted) freedBytes=$($summary.prune_freedBytes)"
  } else {
    Warn "Prune: disabled"
  }

  Ok "Done."
  exit 0
}
catch {
  Err $_.Exception.Message
  exit 1
}