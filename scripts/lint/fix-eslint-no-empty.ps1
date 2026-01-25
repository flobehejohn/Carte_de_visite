[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][int]$Line,
    [int]$Column = 1,
    [string]$Comment = "/* noop (eslint no-empty) */",
    [int]$MaxLookahead = 8
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Path)) { throw "Fichier introuvable: $Path" }

$lines = Get-Content -LiteralPath $Path -Encoding UTF8
if ($Line -lt 1 -or $Line -gt $lines.Count) { throw "Line hors bornes: $Line (1..$($lines.Count))" }

$i = $Line - 1
$changed = $false

function Write-Back([string[]]$content) {
    # CRLF stable + UTF8 sans BOM
    $txt = ($content -join "`r`n") + "`r`n"
    [IO.File]::WriteAllText((Resolve-Path -LiteralPath $Path).Path, $txt, [Text.UTF8Encoding]::new($false))
}

# 1) Patch INLINE: remplace le premier "{}" après la colonne
$lineText = $lines[$i]
$start = [Math]::Max(0, $Column - 1)

$prefix = $lineText.Substring(0, $start)
$suffix = $lineText.Substring($start)

$rxInline = [regex]::new("\{\s*\}")
$m = $rxInline.Match($suffix)
if ($m.Success) {
    $newSuffix = $suffix.Substring(0, $m.Index) + "{ " + $Comment + " }" + $suffix.Substring($m.Index + $m.Length)
    $lines[$i] = $prefix + $newSuffix
    $changed = $true
}

# 2) Patch MULTI-LIGNES: "{", puis uniquement du vide/commentaires, puis "}"
if (-not $changed) {
    $openPos = $lineText.IndexOf("{", $start)
    if ($openPos -ge 0) {
        $openLine = $i
        $closeLine = -1
        $abort = $false

        for ($k = 1; $k -le $MaxLookahead; $k++) {
            $j = $i + $k
            if ($j -ge $lines.Count) { break }

            $t = $lines[$j].Trim()
            if ($t -eq "}") { $closeLine = $j; break }

            # autorise lignes vides + commentaires, sinon abort (bloc pas vide)
            if ($t -ne "" -and -not $t.StartsWith("//") -and -not $t.StartsWith("/*") -and -not $t.StartsWith("*")) {
                $abort = $true
                break
            }
        }

        if (-not $abort -and $closeLine -gt 0) {
            $indent = ($lines[$openLine] -replace '^(\s*).*$', '$1')
            $insert = $indent + "  " + $Comment

            $out = New-Object System.Collections.Generic.List[string]
            for ($p = 0; $p -lt $lines.Count; $p++) {
                $out.Add($lines[$p]) | Out-Null
                if ($p -eq $openLine) { $out.Add($insert) | Out-Null }
            }

            $lines = $out.ToArray()
            $changed = $true
        }
    }
}

if (-not $changed) {
    throw "Impossible de patcher automatiquement no-empty autour de ${Path}:${Line}:${Column}. Affiche le contexte et on le corrige manuellement."
}

Write-Back $lines
Write-Host "[OK] no-empty patch appliqué: ${Path}:${Line}:${Column}" -ForegroundColor Green
