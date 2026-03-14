param(
    [string]$SourceFile = "C:\Users\Dhaval Gajjar\Desktop\COMPLETE-FEATURES-LIST.txt",
    [string]$RepoRoot = (Get-Location).Path,
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

function Is-BulletLine {
    param([string]$Text)
    $t = $Text.Trim()
    return $t.StartsWith("•") -or $t.StartsWith("-")
}

function Is-HeadingLine {
    param(
        [string]$Text,
        [int]$SourceLine,
        [int]$PrevSourceLine
    )

    $t = $Text.Trim()
    if ([string]::IsNullOrWhiteSpace($t)) { return $false }

    if ($t -match '^(##|###)\s+') { return $true }
    if ($t -match '^■\.■') { return $true }
    if ($t -match '^■■■') { return $true }
    if ($t -match '^\d+\.\s+') { return $true }
    if ($t -match '^(🔐\s*)?LEVEL\s+\d+') { return $true }
    if ($t -match '^\d+[️⃣]') { return $true }
    if ($t -match '^(FINAL RESULT|Driver portel|Customer portal|Admin portal)\s*$') { return $true }

    $lineGap = $SourceLine - $PrevSourceLine
    if ($lineGap -gt 1 -and (-not (Is-BulletLine -Text $t)) -and $t.Length -le 160) {
        return $true
    }

    return $false
}

function Get-Slug {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][string]$Fallback
    )

    $s = $Text.ToLowerInvariant()
    $s = [regex]::Replace($s, '[^a-z0-9]+', '-')
    $s = $s.Trim('-')
    if ($s.Length -gt 48) {
        $s = $s.Substring(0, 48).Trim('-')
    }
    if ([string]::IsNullOrWhiteSpace($s)) {
        return $Fallback
    }
    return $s
}

function Get-SafeIdentifier {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][string]$Fallback
    )

    $s = $Text.ToLowerInvariant()
    $s = [regex]::Replace($s, '[^a-z0-9_]+', '_')
    $s = $s.Trim('_')
    if ($s.Length -gt 60) {
        $s = $s.Substring(0, 60).Trim('_')
    }
    if ([string]::IsNullOrWhiteSpace($s)) {
        $s = $Fallback
    }
    if ($s[0] -match '\d') {
        $s = "_" + $s
    }
    return $s
}

function New-BlockObject {
    param(
        [int]$BlockIndex,
        [string]$Title
    )

    return [PSCustomObject]@{
        block_index = $BlockIndex
        title       = $Title
        features    = New-Object System.Collections.Generic.List[object]
    }
}

if (-not (Test-Path -LiteralPath $SourceFile)) {
    throw "Source file not found: $SourceFile"
}

$categoryMeta = [ordered]@{
    "security"   = @{ folder = "01-security"; title = "Security Controls" }
    "customer"   = @{ folder = "02-customer"; title = "Customer Portal" }
    "driver"     = @{ folder = "03-driver"; title = "Driver Portal" }
    "admin"      = @{ folder = "04-admin"; title = "Admin Portal" }
    "additional" = @{ folder = "05-additional"; title = "Additional Features" }
    "misc"       = @{ folder = "10-misc"; title = "Miscellaneous Fallback" }
}

$lines = Get-Content -LiteralPath $SourceFile
$sectionByLine = @{}

if (Test-Path -LiteralPath $CoverageMapCsv) {
    $coverageRows = Import-Csv -Path $CoverageMapCsv
    foreach ($row in $coverageRows) {
        $lineNoParsed = 0
        $lineNoRaw = [string]$row.lineNo
        if (-not [int]::TryParse($lineNoRaw, [ref]$lineNoParsed)) { continue }
        if ($lineNoParsed -lt 1 -or $lineNoParsed -gt $lines.Count) { continue }
        if (-not $sectionByLine.ContainsKey($lineNoParsed)) {
            $sectionByLine[$lineNoParsed] = [string]$row.section
        }
    }
}

$features = New-Object System.Collections.Generic.List[object]
for ($i = 0; $i -lt $lines.Count; $i++) {
    $raw = [string]$lines[$i]
    if ($raw -match '^\s*$') { continue }

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

$categoryBlocks = @{}
foreach ($cat in $categoryMeta.Keys) {
    $categoryBlocks[$cat] = New-Object System.Collections.Generic.List[object]
}

$currentBlockByCategory = @{}
$prevFeatureByCategory = @{}

foreach ($f in $features) {
    $cat = [string]$f.category
    $hasCurrent = $currentBlockByCategory.ContainsKey($cat)
    $prevSourceLine = 0
    if ($prevFeatureByCategory.ContainsKey($cat)) {
        $prevSourceLine = [int]$prevFeatureByCategory[$cat].source_line
    }

    $needsNewBlock = $false
    if (-not $hasCurrent) {
        $needsNewBlock = $true
    }
    else {
        if (Is-HeadingLine -Text ([string]$f.text) -SourceLine ([int]$f.source_line) -PrevSourceLine $prevSourceLine) {
            $needsNewBlock = $true
        }
    }

    if ($needsNewBlock) {
        $blockIndex = $categoryBlocks[$cat].Count + 1
        $blockTitle = ([string]$f.text).Trim()
        if ([string]::IsNullOrWhiteSpace($blockTitle)) {
            $blockTitle = "Block $blockIndex"
        }
        $block = New-BlockObject -BlockIndex $blockIndex -Title $blockTitle
        $categoryBlocks[$cat].Add($block)
        $currentBlockByCategory[$cat] = $block
    }

    $currentBlockByCategory[$cat].features.Add($f)
    $prevFeatureByCategory[$cat] = $f
}

$outputFiles = [ordered]@{
    "security"   = Join-Path $RepoRoot "feature-pack\01-security\disabled-feature-code-blockwise.js"
    "customer"   = Join-Path $RepoRoot "feature-pack\02-customer\disabled-feature-code-blockwise.js"
    "driver"     = Join-Path $RepoRoot "feature-pack\03-driver\disabled-feature-code-blockwise.js"
    "admin"      = Join-Path $RepoRoot "feature-pack\04-admin\disabled-feature-code-blockwise.js"
    "additional" = Join-Path $RepoRoot "feature-pack\05-additional\disabled-feature-code-blockwise.js"
    "misc"       = Join-Path $RepoRoot "feature-pack\05-additional\disabled-misc-feature-code-blockwise.js"
}

$summaryRows = New-Object System.Collections.Generic.List[object]

foreach ($cat in $categoryMeta.Keys) {
    $blocks = $categoryBlocks[$cat]
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine("// GENERATED: BLOCK-WISE DISABLED FEATURE SCAFFOLD")
    [void]$sb.AppendLine("// Category: $cat")
    [void]$sb.AppendLine("// Source: $SourceFile")
    [void]$sb.AppendLine("// Important: Enable any specific block by removing only its wrapping /* and */.")
    [void]$sb.AppendLine("")

    foreach ($block in $blocks) {
        if ($block.features.Count -eq 0) { continue }

        $firstFeature = $block.features[0]
        $lastFeature = $block.features[$block.features.Count - 1]
        $fallbackSlug = "{0}-block-{1:d2}" -f $cat, [int]$block.block_index
        $titleSlug = Get-Slug -Text ([string]$block.title) -Fallback $fallbackSlug
        $blockKey = "{0}-{1}-{2}-{3}" -f $cat, $titleSlug, ([string]$firstFeature.feature_id).ToLowerInvariant(), ([string]$lastFeature.feature_id).ToLowerInvariant()
        if ($blockKey.Length -gt 110) {
            $blockKey = $blockKey.Substring(0, 110).Trim('-')
        }
        $iifeName = Get-SafeIdentifier -Text ("future_feature_block_{0}_{1}_{2}" -f $cat, [int]$block.block_index, $titleSlug) -Fallback ("future_feature_block_{0}_{1}" -f $cat, [int]$block.block_index)

        [void]$summaryRows.Add([PSCustomObject]@{
                category    = $cat
                blockIndex  = [int]$block.block_index
                blockKey    = $blockKey
                title       = [string]$block.title
                startId     = [string]$firstFeature.feature_id
                endId       = [string]$lastFeature.feature_id
                startLine   = [int]$firstFeature.source_line
                endLine     = [int]$lastFeature.source_line
                featureCount = $block.features.Count
            })

        [void]$sb.AppendLine("// === FUTURE_FEATURE_BLOCK_START: $blockKey ===")
        [void]$sb.AppendLine("/*")
        [void]$sb.AppendLine("// Activation: remove this block's opening and closing comment markers to enable only this block.")
        [void]$sb.AppendLine("// Block title: $([string]$block.title)")
        [void]$sb.AppendLine("// Feature range: $($firstFeature.feature_id) .. $($lastFeature.feature_id)")
        [void]$sb.AppendLine("// Source lines: $($firstFeature.source_line) .. $($lastFeature.source_line)")
        [void]$sb.AppendLine("'use strict';")
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine("(function $iifeName() {")
        [void]$sb.AppendLine("  const FUTURE_FEATURE_CATEGORY = '$cat';")
        [void]$sb.AppendLine("  const FUTURE_FEATURE_BLOCK_KEY = '$blockKey';")
        [void]$sb.AppendLine("  const FUTURE_FEATURE_BASE_PATH = '/future/' + FUTURE_FEATURE_CATEGORY + '/' + FUTURE_FEATURE_BLOCK_KEY;")
        [void]$sb.AppendLine("  const FUTURE_FEATURES = [];")
        [void]$sb.AppendLine("")

        foreach ($f in $block.features) {
            $safeText = [string]$f.text
            $safeText = $safeText.Replace("*/", "* /")
            $specJson = $safeText | ConvertTo-Json -Compress
            $fn = "feature_{0:D4}" -f ([int]$f.index)

            $featureBlock = @(
                "  // Feature ID: $($f.feature_id) | Source Line: $($f.source_line)"
                "  function $fn(context = {}) {"
                "    return {"
                "      featureId: '$($f.feature_id)',"
                "      sourceLine: $($f.source_line),"
                "      category: '$cat',"
                "      description: $specJson,"
                "      status: 'disabled',"
                "      implemented: false,"
                "      context"
                "    };"
                "  }"
                ""
                "  FUTURE_FEATURES.push({"
                "    featureId: '$($f.feature_id)',"
                "    sourceLine: $($f.source_line),"
                "    category: '$cat',"
                "    description: $specJson,"
                "    handler: $fn"
                "  });"
                ""
            ) -join [Environment]::NewLine

            [void]$sb.AppendLine($featureBlock)
        }

        $runtimeBlock = @(
            "  function registerFutureFeatureRoutes() {"
            "    if (typeof router === 'undefined' || !router || typeof router.get !== 'function') return;"
            ""
            "    router.__futureFeatureRouteRegistry = router.__futureFeatureRouteRegistry || {};"
            "    if (router.__futureFeatureRouteRegistry[FUTURE_FEATURE_BLOCK_KEY]) return;"
            "    router.__futureFeatureRouteRegistry[FUTURE_FEATURE_BLOCK_KEY] = true;"
            ""
            "    router.get(FUTURE_FEATURE_BASE_PATH + '/catalog', (req, res) => {"
            "      return res.status(200).json({"
            "        category: FUTURE_FEATURE_CATEGORY,"
            "        blockKey: FUTURE_FEATURE_BLOCK_KEY,"
            "        count: FUTURE_FEATURES.length,"
            "        features: FUTURE_FEATURES.map((item) => ({"
            "          featureId: item.featureId,"
            "          sourceLine: item.sourceLine,"
            "          description: item.description"
            "        }))"
            "      });"
            "    });"
            ""
            "    router.get(FUTURE_FEATURE_BASE_PATH + '/catalog/:featureId', (req, res) => {"
            "      const wanted = String(req.params.featureId || '').toUpperCase();"
            "      const item = FUTURE_FEATURES.find((feature) => String(feature.featureId || '').toUpperCase() === wanted);"
            "      if (!item) return res.status(404).json({ message: 'Feature not found' });"
            "      return res.status(200).json({"
            "        category: FUTURE_FEATURE_CATEGORY,"
            "        blockKey: FUTURE_FEATURE_BLOCK_KEY,"
            "        featureId: item.featureId,"
            "        sourceLine: item.sourceLine,"
            "        description: item.description,"
            "        activation: 'ready',"
            "        note: 'Scaffold handler is now active in live file context.'"
            "      });"
            "    });"
            "  }"
            ""
            "  function exposeFutureFeatureRegistry() {"
            "    if (typeof window === 'undefined') return;"
            "    window.__GOINDIARIDE_FUTURE_FEATURES = window.__GOINDIARIDE_FUTURE_FEATURES || {};"
            "    window.__GOINDIARIDE_FUTURE_FEATURES[FUTURE_FEATURE_BLOCK_KEY] = FUTURE_FEATURES;"
            "    window.__GOINDIARIDE_FUTURE_FEATURES_BY_CATEGORY = window.__GOINDIARIDE_FUTURE_FEATURES_BY_CATEGORY || {};"
            "    window.__GOINDIARIDE_FUTURE_FEATURES_BY_CATEGORY[FUTURE_FEATURE_CATEGORY] = window.__GOINDIARIDE_FUTURE_FEATURES_BY_CATEGORY[FUTURE_FEATURE_CATEGORY] || {};"
            "    window.__GOINDIARIDE_FUTURE_FEATURES_BY_CATEGORY[FUTURE_FEATURE_CATEGORY][FUTURE_FEATURE_BLOCK_KEY] = FUTURE_FEATURES;"
            "    if (typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') {"
            "      window.dispatchEvent(new CustomEvent('goindiaride:future-feature-block-ready', {"
            "        detail: {"
            "          category: FUTURE_FEATURE_CATEGORY,"
            "          blockKey: FUTURE_FEATURE_BLOCK_KEY,"
            "          count: FUTURE_FEATURES.length"
            "        }"
            "      }));"
            "    }"
            "  }"
            ""
            "  registerFutureFeatureRoutes();"
            "  exposeFutureFeatureRegistry();"
            "})();"
        ) -join [Environment]::NewLine

        [void]$sb.AppendLine($runtimeBlock)
        [void]$sb.AppendLine("*/")
        [void]$sb.AppendLine("// === FUTURE_FEATURE_BLOCK_END: $blockKey ===")
        [void]$sb.AppendLine("")
    }

    $targetFile = $outputFiles[$cat]
    $targetDir = Split-Path -Parent $targetFile
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    [System.IO.File]::WriteAllText($targetFile, $sb.ToString(), [System.Text.UTF8Encoding]::new($true))
}

$summaryFile = Join-Path $RepoRoot "feature-pack\07-audit\BLOCKWISE-FEATURE-SUMMARY.csv"
$summaryRows | Sort-Object category, blockIndex | Export-Csv -Path $summaryFile -NoTypeInformation -Encoding UTF8

Write-Output "Generated block-wise disabled scaffolds."
Write-Output "Summary: $summaryFile"
