Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-IsWindows {
  try { return $IsWindows } catch { return $env:OS -like "*Windows*" }
}

function Resolve-ToolPath {
  param(
    [Parameter(Mandatory=$true)][string]$Name
  )

  # Si c'est déjà un chemin, on le résout
  $looksLikePath = $Name -match '[\\/]' -or [IO.Path]::IsPathRooted($Name)
  if ($looksLikePath) {
    return (Resolve-Path -LiteralPath $Name).Path
  }

  $cmds = @(Get-Command -Name $Name -All -ErrorAction Stop)
  $isWin = Test-IsWindows

  # Heuristiques Windows : pour npm/npx/node, préfère Program Files\nodejs
  if ($isWin -and $Name.ToLowerInvariant() -in @("npm","npx","node")) {
    $pf = $cmds | Where-Object {
      $_.Source -like "*\Program Files\nodejs\*" -and
      ([IO.Path]::GetExtension($_.Source).ToLowerInvariant() -in @(".exe",".cmd",".bat",".com"))
    } | Select-Object -First 1
    if ($pf) { return $pf.Source }
  }

  # Heuristique git : préfère Program Files\Git\cmd\git.exe
  if ($isWin -and $Name.ToLowerInvariant() -eq "git") {
    $git = $cmds | Where-Object { $_.Source -like "*\Program Files\Git\cmd\git.exe" } | Select-Object -First 1
    if ($git) { return $git.Source }
  }

  if (-not $isWin) {
    return $cmds[0].Source
  }

  # Windows : trie par extension (exe > cmd > bat > com > ps1 > autre)
  $ranked = $cmds | Sort-Object -Property @{
    Expression = {
      $src = $_.Source
      $ext = ([IO.Path]::GetExtension($src)).ToLowerInvariant()
      switch ($ext) {
        ".exe" { 0 }
        ".cmd" { 1 }
        ".bat" { 2 }
        ".com" { 3 }
        ".ps1" { 4 }
        default { 9 }
      }
    }
  }, @{
    Expression = {
      # favorise Application vs ExternalScript à rang égal
      if ($_.CommandType -eq "Application") { 0 } else { 1 }
    }
  }

  return $ranked[0].Source
}

function Quote-CmdArg {
  param([AllowNull()][string]$Value)

  if ($null -eq $Value) { return '""' }
  if ($Value -eq "") { return '""' }

  $needs = $Value -match '[\s&|<>()^"]'
  if (-not $needs) { return $Value }

  # Simple escaping (suffisant pour npm/node/git usuels)
  $escaped = $Value -replace '"','\"'
  return '"' + $escaped + '"'
}

function New-TmpFilePath {
  param([string]$Suffix = ".txt")
  $name = ([Guid]::NewGuid().ToString("N")) + $Suffix
  return (Join-Path ([IO.Path]::GetTempPath()) $name)
}

function Invoke-Proc {
  param(
    [Parameter(Mandatory=$true)][string]$FilePath,
    [string[]]$Arguments = @(),
    [string]$WorkingDirectory = "",
    [int]$TimeoutSec = 0,
    [hashtable]$Env = @{}
  )

  $sw = [Diagnostics.Stopwatch]::StartNew()

  $resolved = Resolve-ToolPath -Name $FilePath
  $ext = ([IO.Path]::GetExtension($resolved)).ToLowerInvariant()
  $isWin = Test-IsWindows

  $runner = $resolved
  $runnerArgs = @()
  $cmdString = ""

  if ($isWin -and $ext -in @(".cmd",".bat")) {
    $runner = $env:ComSpec
    if ([string]::IsNullOrWhiteSpace($runner)) { $runner = "C:\Windows\System32\cmd.exe" }

    $argStr = ""
    if ($Arguments -and $Arguments.Count -gt 0) {
      $argStr = ($Arguments | ForEach-Object { Quote-CmdArg $_ }) -join " "
    }

    # IMPORTANT : quoting cmd /c ""C:\Path With Spaces\tool.cmd" args..."
    $cmdString = '""' + $resolved + '"' + ($(if ($argStr) { " $argStr" } else { "" })) + '"'
    $runnerArgs = @("/d","/s","/c",$cmdString)
  }
  elseif ($isWin -and $ext -eq ".ps1") {
    $pwsh = (Get-Command pwsh -ErrorAction Stop).Source
    $runner = $pwsh
    $runnerArgs = @("-NoProfile","-ExecutionPolicy","Bypass","-File",$resolved) + $Arguments
    $cmdString = ($runnerArgs -join " ")
  }
  else {
    $runner = $resolved
    $runnerArgs = $Arguments
    $cmdString = ($runnerArgs -join " ")
  }

  if ([string]::IsNullOrWhiteSpace($WorkingDirectory)) {
    $WorkingDirectory = (Get-Location).Path
  }

  $outFile = New-TmpFilePath ".stdout.txt"
  $errFile = New-TmpFilePath ".stderr.txt"
  $exit = 1
  $stdout = ""
  $stderr = ""
  $timedOut = $false

  # Pour le fallback env : on sauvegarde puis on restore (évite de polluer ta session)
  $envBackup = [ordered]@{}

  try {
    $spParams = @{
      FilePath               = $runner
      ArgumentList           = $runnerArgs
      WorkingDirectory       = $WorkingDirectory
      RedirectStandardOutput = $outFile
      RedirectStandardError  = $errFile
      NoNewWindow            = $true
      PassThru               = $true
    }

    # Start-Process -Environment est dispo en pwsh moderne ; on le teste proprement
    if ($Env -and $Env.Count -gt 0) {
      $hasEnvParam = (Get-Command Start-Process).Parameters.ContainsKey("Environment")
      if ($hasEnvParam) {
        $spParams.Environment = $Env
      }
      else {
        # fallback : injecte dans l'environnement courant (best effort) + restore ensuite
        foreach ($k in $Env.Keys) {
          $key = [string]$k

          # backup
          $existing = $null
          $had = Test-Path -LiteralPath ("Env:{0}" -f $key)
          if ($had) { $existing = (Get-Item -LiteralPath ("Env:{0}" -f $key)).Value }
          $envBackup[$key] = [ordered]@{ had = [bool]$had; value = $existing }

          # set (IMPORTANT: pas de $env:$k -> parser error)
          Set-Item -Path ("Env:{0}" -f $key) -Value ([string]$Env[$k]) -Force
        }
      }
    }

    $p = Start-Process @spParams

    if ($TimeoutSec -gt 0) {
      $completed = $false
      try {
        $null = $p | Wait-Process -Timeout $TimeoutSec -ErrorAction Stop
        $completed = $true
      } catch {
        $completed = $false
      }

      if (-not $completed -and -not $p.HasExited) {
        $timedOut = $true
        try { $p.Kill($true) } catch {}
        throw "Timeout after ${TimeoutSec}s: $runner $cmdString"
      }
    } else {
      $null = $p | Wait-Process
    }

    $exit = $p.ExitCode
    if (Test-Path -LiteralPath $outFile) { $stdout = Get-Content -LiteralPath $outFile -Raw -ErrorAction SilentlyContinue }
    if (Test-Path -LiteralPath $errFile) { $stderr = Get-Content -LiteralPath $errFile -Raw -ErrorAction SilentlyContinue }
  }
  finally {
    $sw.Stop()

    # restore env si fallback utilisé
    if ($envBackup.Count -gt 0) {
      foreach ($k in $envBackup.Keys) {
        $b = $envBackup[$k]
        $path = ("Env:{0}" -f $k)
        if ($b.had) {
          Set-Item -Path $path -Value ([string]$b.value) -Force
        } else {
          Remove-Item -LiteralPath $path -ErrorAction SilentlyContinue
        }
      }
    }

    Remove-Item -LiteralPath $outFile -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $errFile -Force -ErrorAction SilentlyContinue
  }

  return [ordered]@{
    ExitCode   = [int]$exit
    DurationMs = [int]$sw.ElapsedMilliseconds
    Stdout     = ($stdout ?? "")
    Stderr     = ($stderr ?? "")
    Resolved   = $resolved
    Runner     = $runner
    Command    = ($runner + " " + (($runnerArgs | ForEach-Object { $_ }) -join " ")).Trim()
    TimedOut   = [bool]$timedOut
  }
}

Export-ModuleMember -Function Invoke-Proc, Resolve-ToolPath
