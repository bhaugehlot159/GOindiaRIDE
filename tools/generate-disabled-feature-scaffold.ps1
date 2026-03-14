param(
    [string]$SourceFile = "C:\Users\Dhaval Gajjar\Desktop\COMPLETE-FEATURES-LIST.txt",
    [string]$OutputRoot = (Join-Path (Get-Location) "feature-pack\09-disabled-code-scaffold"),
    [string]$CoverageMapCsv = "C:\Users\Dhaval Gajjar\Desktop\GOindiaRIDE\feature-pack\07-audit\LINE-COVERAGE.csv"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-FeatureCategory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Text
    )

    $t = $Text.ToLowerInvariant()

    if ($t -match "customer portal|costumer|customer|booking|ride|pickup|drop|passenger|luggage|wallet|donation|profile|address|language|tourist|emergency|refund|fare|airport|out station|round trip|city ride|kilometer|km") {
        return "customer"
    }

    if ($t -match "driver portal|driver|vehicle|license|licence|commission|dl|rc|fleet|pan card|aadhar|aadhaar") {
        return "driver"
    }

    if ($t -match "admin portal|admin|approval|manage|moderation|super admin|control center|operations dashboard") {
        return "admin"
    }

    if ($t -match "password|jwt|otp|xss|csrf|cors|helmet|ratelimit|rate limit|lock|risk|security|firewall|cloudflare|auth|login|ban|encryption|gdpr|privacy|terms|cookie|suspicious|fraud|replay|tampering|signature|2fa|ip restriction|vpn|bot|captcha|secure") {
        return "security"
    }

    if ($t -match " ai |ai-|machine learning|ml|anomaly|predict|automation|intelligence|recommend|optimization|behaviour|behavior|pattern detection|scoring|payment|upi|card|refund|billing|invoice|gst|tax|wallet topup|cash|advance payment|gateway|backup|monitor|alert|logs|pm2|performance|cache|cdn|pwa|offline|service|inventory|asset|support|uptime|analytics|tracking|google|facebook|maps|whatsapp|firebase|api|calendar|sms|email|push|analytics integration|gateway integration|cloud|ui|design|theme|tricolor|tirange|international brand|brand|color|responsive|mobile|ux|look|dashboard") {
        return "additional"
    }

    return "misc"
}

if (-not (Test-Path -LiteralPath $SourceFile)) {
    throw "Source file not found: $SourceFile"
}

$categoryMeta = [ordered]@{
    "security"   = @{ folder = "01-security";    title = "Security Controls" }
    "customer"   = @{ folder = "02-customer";    title = "Customer Portal" }
    "driver"     = @{ folder = "03-driver";      title = "Driver Portal" }
    "admin"      = @{ folder = "04-admin";       title = "Admin Portal" }
    "additional" = @{ folder = "05-additional";  title = "Additional Features" }
    "misc"       = @{ folder = "10-misc";        title = "Miscellaneous Fallback" }
}

$lines = Get-Content -LiteralPath $SourceFile
$features = New-Object System.Collections.Generic.List[object]
$sectionByLine = @{}

if (Test-Path -LiteralPath $CoverageMapCsv) {
    $coverageRows = Import-Csv -Path $CoverageMapCsv
    foreach ($row in $coverageRows) {
        $lineNoParsed = 0
        $lineNoRaw = [string]$row.lineNo
        if (-not [int]::TryParse($lineNoRaw, [ref]$lineNoParsed)) {
            continue
        }

        if ($lineNoParsed -lt 1 -or $lineNoParsed -gt $lines.Count) {
            continue
        }

        if (-not $sectionByLine.ContainsKey($lineNoParsed)) {
            $sectionByLine[$lineNoParsed] = [string]$row.section
        }
    }
}

for ($i = 0; $i -lt $lines.Count; $i++) {
    $raw = [string]$lines[$i]
    if ($raw -match '^\s*$') {
        continue
    }

    $trimmed = $raw.Trim()
    $featureIdNumber = $features.Count + 1
    $featureId = "F{0:D4}" -f $featureIdNumber
    $sourceLineNumber = $i + 1
    $mappedSection = ""
    if ($sectionByLine.ContainsKey($sourceLineNumber)) {
        $mappedSection = ([string]$sectionByLine[$sourceLineNumber]).ToLowerInvariant().Trim()
    }

    switch ($mappedSection) {
        "security" { $category = "security" }
        "customer" { $category = "customer" }
        "driver" { $category = "driver" }
        "admin" { $category = "admin" }
        "additional" { $category = "additional" }
        default { $category = Get-FeatureCategory -Text $trimmed }
    }

    if (-not $categoryMeta.Contains($category)) {
        $category = "misc"
    }

    $features.Add([PSCustomObject]@{
            feature_id  = $featureId
            index       = $featureIdNumber
            source_line = $sourceLineNumber
            category    = $category
            text        = $trimmed
        })
}

if (Test-Path -LiteralPath $OutputRoot) {
    # Additive behavior: do not delete old content, only overwrite known generated files.
    $null = $true
}
else {
    New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
}

$metaDir = Join-Path $OutputRoot "00-meta"
New-Item -ItemType Directory -Path $metaDir -Force | Out-Null

$featurePackRoot = Split-Path -Parent $OutputRoot
$primaryTargets = [ordered]@{
    "security"     = Join-Path $featurePackRoot "01-security\disabled-feature-code.js"
    "customer"     = Join-Path $featurePackRoot "02-customer\disabled-feature-code.js"
    "driver"       = Join-Path $featurePackRoot "03-driver\disabled-feature-code.js"
    "admin"        = Join-Path $featurePackRoot "04-admin\disabled-feature-code.js"
    "additional"   = Join-Path $featurePackRoot "05-additional\disabled-feature-code.js"
    "misc"         = Join-Path $featurePackRoot "05-additional\disabled-misc-fallback-feature-code.js"
}

$builders = @{}
foreach ($category in $categoryMeta.Keys) {
    $info = $categoryMeta[$category]
    $dir = Join-Path $OutputRoot $info.folder
    New-Item -ItemType Directory -Path $dir -Force | Out-Null

    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine("/*")
    [void]$sb.AppendLine("// ACTIVATION-READY DISABLED CODE BLOCK")
    [void]$sb.AppendLine("// Section: $($info.title)")
    [void]$sb.AppendLine("// Source: $SourceFile")
    [void]$sb.AppendLine("// Activation steps:")
    [void]$sb.AppendLine("// 1) Remove opening block marker at top.")
    [void]$sb.AppendLine("// 2) Remove closing block marker at bottom.")
    [void]$sb.AppendLine("// 3) No additional code edits needed.")
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("'use strict';")
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("const FUTURE_FEATURE_CATEGORY = '$category';")
    [void]$sb.AppendLine("const FUTURE_FEATURE_BASE_PATH = '/future/' + FUTURE_FEATURE_CATEGORY;")
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("const FUTURE_FEATURES = [];")
    [void]$sb.AppendLine("")
    $builders[$category] = $sb
}

foreach ($f in $features) {
    $safeText = [string]$f.text
    $safeText = $safeText.Replace("*/", "* /")
    $specJson = $safeText | ConvertTo-Json -Compress
    $fn = "feature_{0:D4}" -f ([int]$f.index)

    $block = @(
        "// Feature ID: $($f.feature_id) | Source Line: $($f.source_line)"
        "function $fn(context = {}) {"
        "  return {"
        "    featureId: '$($f.feature_id)',"
        "    sourceLine: $($f.source_line),"
        "    category: '$($f.category)',"
        "    description: $specJson,"
        "    status: 'disabled',"
        "    implemented: false,"
        "    context"
        "  };"
        "}"
        ""
        "FUTURE_FEATURES.push({"
        "  featureId: '$($f.feature_id)',"
        "  sourceLine: $($f.source_line),"
        "  category: '$($f.category)',"
        "  description: $specJson,"
        "  handler: $fn"
        "});"
        ""
    ) -join [Environment]::NewLine

    [void]$builders[$f.category].AppendLine($block)
}

foreach ($category in $categoryMeta.Keys) {
    [void]$builders[$category].AppendLine("function registerFutureFeatureRoutes() {")
    [void]$builders[$category].AppendLine("  if (typeof router === 'undefined' || !router || typeof router.get !== 'function') return;")
    [void]$builders[$category].AppendLine("")
    [void]$builders[$category].AppendLine("  router.__futureFeatureRouteRegistry = router.__futureFeatureRouteRegistry || {};")
    [void]$builders[$category].AppendLine("  if (router.__futureFeatureRouteRegistry[FUTURE_FEATURE_CATEGORY]) return;")
    [void]$builders[$category].AppendLine("  router.__futureFeatureRouteRegistry[FUTURE_FEATURE_CATEGORY] = true;")
    [void]$builders[$category].AppendLine("")
    [void]$builders[$category].AppendLine("  router.get(FUTURE_FEATURE_BASE_PATH + '/catalog', (req, res) => {")
    [void]$builders[$category].AppendLine("    return res.status(200).json({")
    [void]$builders[$category].AppendLine("      category: FUTURE_FEATURE_CATEGORY,")
    [void]$builders[$category].AppendLine("      count: FUTURE_FEATURES.length,")
    [void]$builders[$category].AppendLine("      features: FUTURE_FEATURES.map((item) => ({")
    [void]$builders[$category].AppendLine("        featureId: item.featureId,")
    [void]$builders[$category].AppendLine("        sourceLine: item.sourceLine,")
    [void]$builders[$category].AppendLine("        description: item.description")
    [void]$builders[$category].AppendLine("      }))")
    [void]$builders[$category].AppendLine("    });")
    [void]$builders[$category].AppendLine("  });")
    [void]$builders[$category].AppendLine("")
    [void]$builders[$category].AppendLine("  router.get(FUTURE_FEATURE_BASE_PATH + '/catalog/:featureId', (req, res) => {")
    [void]$builders[$category].AppendLine("    const wanted = String(req.params.featureId || '').toUpperCase();")
    [void]$builders[$category].AppendLine("    const item = FUTURE_FEATURES.find((f) => String(f.featureId || '').toUpperCase() === wanted);")
    [void]$builders[$category].AppendLine("    if (!item) return res.status(404).json({ message: 'Feature not found' });")
    [void]$builders[$category].AppendLine("    return res.status(200).json({")
    [void]$builders[$category].AppendLine("      category: FUTURE_FEATURE_CATEGORY,")
    [void]$builders[$category].AppendLine("      featureId: item.featureId,")
    [void]$builders[$category].AppendLine("      sourceLine: item.sourceLine,")
    [void]$builders[$category].AppendLine("      description: item.description,")
    [void]$builders[$category].AppendLine("      activation: 'ready',")
    [void]$builders[$category].AppendLine("      note: 'Scaffold handler is now active in live file context.'")
    [void]$builders[$category].AppendLine("    });")
    [void]$builders[$category].AppendLine("  });")
    [void]$builders[$category].AppendLine("}")
    [void]$builders[$category].AppendLine("")
    [void]$builders[$category].AppendLine("function exposeFutureFeatureRegistry() {")
    [void]$builders[$category].AppendLine("  if (typeof window !== 'undefined') {")
    [void]$builders[$category].AppendLine("  window.__GOINDIARIDE_FUTURE_FEATURES = window.__GOINDIARIDE_FUTURE_FEATURES || {};")
    [void]$builders[$category].AppendLine("  window.__GOINDIARIDE_FUTURE_FEATURES['$category'] = FUTURE_FEATURES;")
    [void]$builders[$category].AppendLine("  if (typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') {")
    [void]$builders[$category].AppendLine("    window.dispatchEvent(new CustomEvent('goindiaride:future-features-ready', {")
    [void]$builders[$category].AppendLine("      detail: { category: FUTURE_FEATURE_CATEGORY, count: FUTURE_FEATURES.length }")
    [void]$builders[$category].AppendLine("    }));")
    [void]$builders[$category].AppendLine("  }")
    [void]$builders[$category].AppendLine("  }")
    [void]$builders[$category].AppendLine("}")
    [void]$builders[$category].AppendLine("")
    [void]$builders[$category].AppendLine("(function activateFutureFeatureScaffold() {")
    [void]$builders[$category].AppendLine("  registerFutureFeatureRoutes();")
    [void]$builders[$category].AppendLine("  exposeFutureFeatureRegistry();")
    [void]$builders[$category].AppendLine("})();")
    [void]$builders[$category].AppendLine("")
    [void]$builders[$category].AppendLine("*/")

    $folder = $categoryMeta[$category].folder
    $file = Join-Path (Join-Path $OutputRoot $folder) "disabled-features.js"
    [System.IO.File]::WriteAllText($file, $builders[$category].ToString(), [System.Text.UTF8Encoding]::new($true))

    $primaryFile = $primaryTargets[$category]
    $primaryDir = Split-Path -Parent $primaryFile
    New-Item -ItemType Directory -Path $primaryDir -Force | Out-Null
    [System.IO.File]::WriteAllText($primaryFile, $builders[$category].ToString(), [System.Text.UTF8Encoding]::new($true))
}

# Meta: CSV index (every non-empty source line represented)
$csvPath = Join-Path $metaDir "feature-index.csv"
$features | Select-Object feature_id, source_line, category, text | Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8

# Meta: JSON index
$jsonPath = Join-Path $metaDir "feature-index.json"
($features | Select-Object feature_id, source_line, category, text) | ConvertTo-Json -Depth 5 | Set-Content -Path $jsonPath -Encoding UTF8

# Meta: coverage summary
$summaryPath = Join-Path $metaDir "coverage-summary.md"
$totalLines = $lines.Count
$nonEmptyLines = $features.Count
$blankLines = $totalLines - $nonEmptyLines
$groups = $features | Group-Object category | Sort-Object Name

$summary = New-Object System.Text.StringBuilder
[void]$summary.AppendLine("# Disabled Scaffold Coverage Summary")
[void]$summary.AppendLine("")
[void]$summary.AppendLine("- Source file: $SourceFile")
[void]$summary.AppendLine("- Total lines: $totalLines")
[void]$summary.AppendLine("- Non-empty lines converted to stubs: $nonEmptyLines")
[void]$summary.AppendLine("- Blank lines skipped: $blankLines")
[void]$summary.AppendLine("- Coverage status: 1:1 mapping of non-empty lines to disabled stubs")
[void]$summary.AppendLine("")
[void]$summary.AppendLine("## Category Counts")
[void]$summary.AppendLine("")
[void]$summary.AppendLine("| Category | Count | Folder |")
[void]$summary.AppendLine("|---|---:|---|")

foreach ($g in $groups) {
    $folder = $categoryMeta[$g.Name].folder
    [void]$summary.AppendLine("| $($g.Name) | $($g.Count) | $folder |")
}

[void]$summary.AppendLine("")
[void]$summary.AppendLine("## Disabled Code Rule")
[void]$summary.AppendLine("- Each generated file has one outer /* ... */ block and remains inactive by design.")
[void]$summary.AppendLine("- To activate a file later: remove only first /* and final */.")

[System.IO.File]::WriteAllText($summaryPath, $summary.ToString(), [System.Text.UTF8Encoding]::new($true))

# Meta: quick readme
$readmePath = Join-Path $OutputRoot "README.md"
$readme = @'
# Disabled Feature Code Scaffold

This scaffold is generated from `COMPLETE-FEATURES-LIST.txt` without deleting any existing project files.

## What is generated
- Folder-wise `disabled-features.js` files by domain
- `00-meta/feature-index.csv` and `00-meta/feature-index.json`
- `00-meta/coverage-summary.md`
- Category-wise activation-ready files also placed in existing `feature-pack/01..05` folders
- Section mapping is driven by `feature-pack/07-audit/LINE-COVERAGE.csv` so points stay in their proper files

## Important
- Every generated code file is disabled with one outer block comment: `/* ... */`.
- To activate in future, remove only first `/*` and last `*/` in that file.
- This is intentional for staged implementation.
'@
[System.IO.File]::WriteAllText($readmePath, $readme, [System.Text.UTF8Encoding]::new($true))

Write-Output "Generated scaffold root: $OutputRoot"
Write-Output "Total non-empty features converted: $nonEmptyLines"
