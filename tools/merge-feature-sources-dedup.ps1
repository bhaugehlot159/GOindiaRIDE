param(
    [string]$BaseSource = "C:\Users\Dhaval Gajjar\Desktop\GOindiaRIDE\COMPLETE-FEATURES-LIST.txt",
    [string]$NewSource = "C:\Users\Dhaval Gajjar\Desktop\goindiaride 1 द अल्टीमे.txt",
    [string]$OutputFile = "C:\Users\Dhaval Gajjar\Desktop\GOindiaRIDE\feature-pack\00-source\MERGED-FEATURES-LIST-UNIQUE.txt"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Normalize-Key {
    param([string]$Text)
    $t = $Text -replace [char]0x200B, ''   # zero-width space
    $t = $t -replace [char]0xFEFF, ''      # BOM marker if present in-line
    $t = $t.Trim()
    $t = [regex]::Replace($t, '\s+', ' ')
    $t = $t.ToLowerInvariant()
    return $t
}

function Clean-Line {
    param([string]$Text)
    $t = $Text -replace [char]0x200B, ''
    $t = $t -replace [char]0xFEFF, ''
    return $t.Trim()
}

if (-not (Test-Path -LiteralPath $BaseSource)) {
    throw "Base source not found: $BaseSource"
}
if (-not (Test-Path -LiteralPath $NewSource)) {
    throw "New source not found: $NewSource"
}

$baseLines = Get-Content -LiteralPath $BaseSource
$newLines = Get-Content -LiteralPath $NewSource

$seen = @{}
$output = New-Object System.Collections.Generic.List[string]
$baseAdded = 0
$newAdded = 0
$newDup = 0

foreach ($raw in $baseLines) {
    $clean = Clean-Line -Text ([string]$raw)
    if ($clean -match '^\s*$') { continue }
    $key = Normalize-Key -Text $clean
    if ([string]::IsNullOrWhiteSpace($key)) { continue }
    if (-not $seen.ContainsKey($key)) {
        $seen[$key] = $true
        $output.Add($clean)
        $baseAdded++
    }
}

foreach ($raw in $newLines) {
    $clean = Clean-Line -Text ([string]$raw)
    if ($clean -match '^\s*$') { continue }
    $key = Normalize-Key -Text $clean
    if ([string]::IsNullOrWhiteSpace($key)) { continue }
    if (-not $seen.ContainsKey($key)) {
        $seen[$key] = $true
        $output.Add($clean)
        $newAdded++
    }
    else {
        $newDup++
    }
}

$outDir = Split-Path -Parent $OutputFile
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
[System.IO.File]::WriteAllLines($OutputFile, $output, [System.Text.UTF8Encoding]::new($true))

Write-Output "MERGED_FILE=$OutputFile"
Write-Output "BASE_UNIQUE_ADDED=$baseAdded"
Write-Output "NEW_UNIQUE_ADDED=$newAdded"
Write-Output "NEW_DUPLICATES_IGNORED=$newDup"
Write-Output "TOTAL_UNIQUE_POINTS=$($output.Count)"
