param(
    [string]$BaseSource = "C:\Users\Dhaval Gajjar\Desktop\GOindiaRIDE\feature-pack\00-source\MERGED-FEATURES-LIST-UNIQUE.txt",
    [string[]]$AdditionalSources = @(
        "C:\Users\Dhaval Gajjar\Desktop\goindiaride 1 द अल्टीमे.txt",
        "C:\Users\Dhaval Gajjar\Downloads\goindia 1️⃣ Jaipur.txt",
        "C:\Users\Dhaval Gajjar\Downloads\rajasthan-tourist-places (2).js"
    ),
    [string]$OutputFile = "C:\Users\Dhaval Gajjar\Desktop\GOindiaRIDE\feature-pack\00-source\MERGED-FEATURES-LIST-UNIQUE.txt"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Normalize-Key {
    param([string]$Text)
    $t = $Text -replace [char]0x200B, ''   # zero-width space
    $t = $t -replace [char]0xFEFF, ''      # BOM marker if present in-line
    $t = $t.Trim()
    # Normalize common list prefixes in source files for better dedupe.
    $t = [regex]::Replace($t, '^(?:\p{Nd}\uFE0F?\u20E3\s*)+', '')
    $t = [regex]::Replace($t, '^\s*[•\-\–\—\*\(\)\[\]\{\}]+\s*', '')
    $t = [regex]::Replace($t, '^\s*\d+\s*[-\.\):]\s*', '')
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
if ($null -eq $AdditionalSources -or $AdditionalSources.Count -eq 0) {
    throw "No additional sources provided."
}
$baseLines = Get-Content -LiteralPath $BaseSource

$seen = @{}
$output = New-Object System.Collections.Generic.List[string]
$baseAdded = 0
$sourceStats = New-Object System.Collections.Generic.List[object]

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

foreach ($source in $AdditionalSources) {
    if (-not (Test-Path -LiteralPath $source)) {
        throw "Additional source not found: $source"
    }

    $lines = Get-Content -LiteralPath $source
    $added = 0
    $dup = 0

    foreach ($raw in $lines) {
        $clean = Clean-Line -Text ([string]$raw)
        if ($clean -match '^\s*$') { continue }
        $key = Normalize-Key -Text $clean
        if ([string]::IsNullOrWhiteSpace($key)) { continue }
        if (-not $seen.ContainsKey($key)) {
            $seen[$key] = $true
            $output.Add($clean)
            $added++
        }
        else {
            $dup++
        }
    }

    $sourceStats.Add([PSCustomObject]@{
            source = $source
            unique_added = $added
            duplicates_ignored = $dup
        })
}

$outDir = Split-Path -Parent $OutputFile
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
[System.IO.File]::WriteAllLines($OutputFile, $output, [System.Text.UTF8Encoding]::new($true))

Write-Output "MERGED_FILE=$OutputFile"
Write-Output "BASE_UNIQUE_ADDED=$baseAdded"
foreach ($s in $sourceStats) {
    Write-Output ("SOURCE={0}" -f $s.source)
    Write-Output ("SOURCE_UNIQUE_ADDED={0}" -f $s.unique_added)
    Write-Output ("SOURCE_DUPLICATES_IGNORED={0}" -f $s.duplicates_ignored)
}
Write-Output "TOTAL_UNIQUE_POINTS=$($output.Count)"
