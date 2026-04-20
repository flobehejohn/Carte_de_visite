param(
  [switch]$Strict
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-OwnPropValue {
  param(
    [Parameter(Mandatory = $true)] $Object,
    [Parameter(Mandatory = $true)] [string] $Name
  )

  if ($null -eq $Object) { return $null }
  if ($Object.PSObject.Properties.Name -contains $Name) {
    return $Object.$Name
  }
  return $null
}

function Test-OwnProp {
  param(
    [Parameter(Mandatory = $true)] $Object,
    [Parameter(Mandatory = $true)] [string] $Name
  )

  if ($null -eq $Object) { return $false }
  return ($Object.PSObject.Properties.Name -contains $Name)
}

function Resolve-SnapshotRoot {
  param([Parameter(Mandatory = $true)] $Data)

  # 1. Snapshot brut
  if ((Test-OwnProp -Object $Data -Name 'qualityProfiles') -or
      (Test-OwnProp -Object $Data -Name 'qualityProfile')) {
    return $Data
  }

  # 2. Forme { exports: {...} }
  $exports = Get-OwnPropValue -Object $Data -Name 'exports'
  if ($null -ne $exports) {
    if ((Test-OwnProp -Object $exports -Name 'qualityProfiles') -or
        (Test-OwnProp -Object $exports -Name 'qualityProfile')) {
      return $exports
    }
  }

  # 3. Forme { snapshot: {...} }
  $snapshot = Get-OwnPropValue -Object $Data -Name 'snapshot'
  if ($null -ne $snapshot) { return $snapshot }

  # 4. Forme { probe: { snapshot: {...} } }
  $probe = Get-OwnPropValue -Object $Data -Name 'probe'
  if ($null -ne $probe) {
    $snapshot = Get-OwnPropValue -Object $probe -Name 'snapshot'
    if ($null -ne $snapshot) { return $snapshot }

    if ((Test-OwnProp -Object $probe -Name 'qualityProfiles') -or
        (Test-OwnProp -Object $probe -Name 'qualityProfile')) {
      return $probe
    }
  }

  # 5. Forme { summary: { exports: {...} } }
  $summaryOuter = Get-OwnPropValue -Object $Data -Name 'summary'
  if ($null -ne $summaryOuter) {
    $exports = Get-OwnPropValue -Object $summaryOuter -Name 'exports'
    if ($null -ne $exports) { return $exports }

    # 6. Forme legacy { summary: { summary: { exports: {...} } } }
    $summaryInner = Get-OwnPropValue -Object $summaryOuter -Name 'summary'
    if ($null -ne $summaryInner) {
      $exports = Get-OwnPropValue -Object $summaryInner -Name 'exports'
      if ($null -ne $exports) { return $exports }

      if ((Test-OwnProp -Object $summaryInner -Name 'qualityProfiles') -or
          (Test-OwnProp -Object $summaryInner -Name 'qualityProfile')) {
        return $summaryInner
      }
    }

    if ((Test-OwnProp -Object $summaryOuter -Name 'qualityProfiles') -or
        (Test-OwnProp -Object $summaryOuter -Name 'qualityProfile')) {
      return $summaryOuter
    }
  }

  return $null
}

function Assert-NotNull {
  param(
    [Parameter(Mandatory = $true)] $Value,
    [Parameter(Mandatory = $true)] [string] $Label
  )

  if ($null -eq $Value) {
    throw "[KO] Champ obligatoire absent : $Label"
  }
}

function Assert-NotBlank {
  param(
    [Parameter(Mandatory = $true)] $Value,
    [Parameter(Mandatory = $true)] [string] $Label
  )

  if ($null -eq $Value) {
    throw "[KO] Champ obligatoire absent : $Label"
  }

  if ($Value -is [string] -and [string]::IsNullOrWhiteSpace($Value)) {
    throw "[KO] Champ obligatoire vide : $Label"
  }
}

function Assert-HasProperty {
  param(
    [Parameter(Mandatory = $true)] $Object,
    [Parameter(Mandatory = $true)] [string] $Name,
    [Parameter(Mandatory = $true)] [string] $Label
  )

  if (-not (Test-OwnProp -Object $Object -Name $Name)) {
    throw "[KO] Propriété obligatoire absente : $Label"
  }
}

$runtimeJson = Get-ChildItem .\audit\_latest -Recurse -File |
  Where-Object {
    $_.Extension -eq '.json' -and (
      $_.Name -match 'runtime' -or
      $_.Name -match 'probe'
    )
  } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $runtimeJson) {
  throw "[KO] Aucun JSON runtime/probe trouvé sous .\audit\_latest"
}

Write-Host "[INFO] JSON utilisé :" $runtimeJson.FullName -ForegroundColor Cyan

$data = Get-Content $runtimeJson.FullName -Raw | ConvertFrom-Json -Depth 100
$snapshot = Resolve-SnapshotRoot -Data $data

if (-not $snapshot) {
  throw "[KO] Impossible de résoudre le snapshot runtime dans $($runtimeJson.Name)"
}

$qualityProfiles = Get-OwnPropValue -Object $snapshot -Name 'qualityProfiles'
Assert-NotNull -Value $qualityProfiles -Label 'snapshot.qualityProfiles'

$qualityProfile = Get-OwnPropValue -Object $snapshot -Name 'qualityProfile'
$current = Get-OwnPropValue -Object $qualityProfiles -Name 'current'
$forced = Get-OwnPropValue -Object $qualityProfiles -Name 'forced'
$source = Get-OwnPropValue -Object $qualityProfiles -Name 'source'
$estimatedCost = Get-OwnPropValue -Object $qualityProfiles -Name 'estimatedCost'
$deviceClass = Get-OwnPropValue -Object $qualityProfiles -Name 'deviceClass'
$dprBucket = Get-OwnPropValue -Object $qualityProfiles -Name 'dprBucket'
$rendererArea = Get-OwnPropValue -Object $qualityProfiles -Name 'rendererArea'

Assert-NotBlank -Value $qualityProfile -Label 'snapshot.qualityProfile'
Assert-NotBlank -Value $current -Label 'snapshot.qualityProfiles.current'
Assert-HasProperty -Object $qualityProfiles -Name 'forced' -Label 'snapshot.qualityProfiles.forced'
Assert-NotNull -Value $estimatedCost -Label 'snapshot.qualityProfiles.estimatedCost'

if ($Strict) {
  Assert-NotBlank -Value $source -Label 'snapshot.qualityProfiles.source'
  Assert-NotBlank -Value $deviceClass -Label 'snapshot.qualityProfiles.deviceClass'
  Assert-NotBlank -Value $dprBucket -Label 'snapshot.qualityProfiles.dprBucket'
  Assert-NotNull -Value $rendererArea -Label 'snapshot.qualityProfiles.rendererArea'
}

$report = [ordered]@{
  qualityProfile = $qualityProfile
  current        = $current
  forced         = $forced
  source         = $source
  estimatedCost  = $estimatedCost
  deviceClass    = $deviceClass
  dprBucket      = $dprBucket
  rendererArea   = $rendererArea
}

Write-Host "[OK] Snapshot qualité certifié :" -ForegroundColor Green
$report | ConvertTo-Json -Depth 10
