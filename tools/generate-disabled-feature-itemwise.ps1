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

    if ($t -match "customer portal|costumer|customer|booking|ride|pickup|drop|passenger|luggage|wallet|donation|profile|address|language|tourist|emergency|refund|fare|airport|out station|round trip|city ride|kilometer|km|pick up|dropoff|location|eta|route|trip|पिकअप|ड्रॉप|बुकिंग|ग्राहक|यात्रा|किराया|लोकेशन|ट्रिप|रूट|लैंडमार्क|गेट|फ्लाइट|रेलवे|पीएनआर|ऑटो-रूट|ऑटो-पिकअप|फेवरेट") {
        return "customer"
    }

    if ($t -match "driver portal|driver|vehicle|license|licence|commission|dl|rc|fleet|pan card|aadhar|aadhaar|rating|driver rating|earning|payout|ड्राइवर|वाहन|लाइसेंस|केवाईसी|रेटिंग|अर्निंग|भुगतान|कमीशन") {
        return "driver"
    }

    if ($t -match "admin portal|admin|approval|manage|moderation|super admin|control center|operations dashboard|dashboard|reports|control|monitoring|एडमिन|प्रबंधन|डैशबोर्ड|रिपोर्ट|नियंत्रण|ऑपरेशन") {
        return "admin"
    }

    if ($t -match "password|jwt|otp|xss|csrf|cors|helmet|ratelimit|rate limit|lock|risk|security|firewall|cloudflare|auth|login|ban|encryption|gdpr|privacy|terms|cookie|suspicious|fraud|replay|tampering|signature|2fa|ip restriction|vpn|bot|captcha|secure|सुरक्षा|ओटीपी|धोखाधड़ी|फ्रॉड|एन्क्रिप्शन|सुरक्षित|प्राइवेसी") {
        return "security"
    }

    if ($t -match " ai |ai-|machine learning|ml|anomaly|predict|automation|intelligence|recommend|optimization|behaviour|behavior|pattern detection|scoring|payment|upi|card|refund|billing|invoice|gst|tax|wallet topup|cash|advance payment|gateway|backup|monitor|alert|logs|pm2|performance|cache|cdn|pwa|offline|service|inventory|asset|support|uptime|analytics|tracking|google|facebook|maps|whatsapp|firebase|api|calendar|sms|email|push|analytics integration|gateway integration|cloud|ui|design|theme|tricolor|tirange|international brand|brand|color|responsive|mobile|ux|look|branding|encyclopedia|museum|heritage|festival|district|राजस्थान|इतिहास|विजुअल|ब्रांडिंग|एनालिटिक्स|कंटेंट|गैलरी|टूर|एआई|डिजिटल|विश्वकोश") {
        return "additional"
    }

    return "misc"
}

function Get-FeatureBucket {
    param([string]$Text)
    $t = $Text.ToLowerInvariant()
    if ($t -match "auto-suggest|auto suggestion|auto-suggestions|autosuggest|auto suggest|auto-sync|auto sync|auto-adjust|auto adjust|ऑटो-सिंक|ऑटो-एडजस्ट|ऑटो-पिकअप|ऑटो-सजेशन|ऑटो सुझाव|सुझाव") {
        return "auto-suggestion"
    }
    return "general"
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
        $category = "additional"
    }

    # Keep all unmatched points in live-injected flows (no point should remain orphaned).
    if ($category -eq "misc") {
        $category = "additional"
    }

    $features.Add([PSCustomObject]@{
            feature_id  = $featureId
            index       = $featureIdNumber
            source_line = $sourceLineNumber
            category    = $category
            bucket      = (Get-FeatureBucket -Text $trimmed)
            text        = $trimmed
        })
}

$featuresByCategory = @{}
foreach ($cat in $categoryMeta.Keys) {
    $featuresByCategory[$cat] = New-Object System.Collections.Generic.List[object]
}
foreach ($f in $features) {
    $featuresByCategory[[string]$f.category].Add($f)
}

$outputFiles = [ordered]@{
    "security"   = Join-Path $RepoRoot "feature-pack\01-security\disabled-feature-code-itemwise.js"
    "customer"   = Join-Path $RepoRoot "feature-pack\02-customer\disabled-feature-code-itemwise.js"
    "driver"     = Join-Path $RepoRoot "feature-pack\03-driver\disabled-feature-code-itemwise.js"
    "admin"      = Join-Path $RepoRoot "feature-pack\04-admin\disabled-feature-code-itemwise.js"
    "additional" = Join-Path $RepoRoot "feature-pack\05-additional\disabled-feature-code-itemwise.js"
    "misc"       = Join-Path $RepoRoot "feature-pack\05-additional\disabled-misc-feature-code-itemwise.js"
}

$summaryRows = New-Object System.Collections.Generic.List[object]

foreach ($cat in $categoryMeta.Keys) {
    $categoryFeatures = $featuresByCategory[$cat]
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine("// GENERATED: ITEM-WISE DISABLED FEATURE SCAFFOLD")
    [void]$sb.AppendLine("// Category: $cat")
    [void]$sb.AppendLine("// Source: $SourceFile")
    [void]$sb.AppendLine("// Important: each feature is a separate commented block.")
    [void]$sb.AppendLine("")

    foreach ($f in $categoryFeatures) {
        $safeText = [string]$f.text
        $safeText = $safeText.Replace("*/", "* /")
        $specJson = $safeText | ConvertTo-Json -Compress
        $fidLower = ([string]$f.feature_id).ToLowerInvariant()
        $blockKey = "{0}-{1}-line-{2}" -f $cat, $fidLower, [int]$f.source_line
        $iifeName = Get-SafeIdentifier -Text ("future_feature_{0}_{1}" -f $cat, $fidLower) -Fallback ("future_feature_{0}_{1}" -f $cat, [int]$f.index)

        [void]$summaryRows.Add([PSCustomObject]@{
                category    = $cat
                bucket      = [string]$f.bucket
                featureId   = [string]$f.feature_id
                sourceLine  = [int]$f.source_line
                blockKey    = $blockKey
                text        = [string]$f.text
            })

        [void]$sb.AppendLine("// === FUTURE_FEATURE_ITEM_START: $blockKey ===")
        [void]$sb.AppendLine("/*")
        [void]$sb.AppendLine("// Activation: remove opening and closing comment markers of this item only.")
        [void]$sb.AppendLine("// Feature ID: $($f.feature_id) | Source Line: $($f.source_line)")
        [void]$sb.AppendLine("// Description: $safeText")
        [void]$sb.AppendLine("'use strict';")
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine("(function $iifeName() {")
        [void]$sb.AppendLine("  const FUTURE_FEATURE_CATEGORY = '$cat';")
        [void]$sb.AppendLine("  const FUTURE_FEATURE_BLOCK_KEY = '$blockKey';")
        [void]$sb.AppendLine("  const FUTURE_FEATURE_BASE_PATH = '/future/' + FUTURE_FEATURE_CATEGORY + '/' + FUTURE_FEATURE_BLOCK_KEY;")
        [void]$sb.AppendLine("  const FEATURE = {")
        [void]$sb.AppendLine("    featureId: '$($f.feature_id)',")
        [void]$sb.AppendLine("    sourceLine: $($f.source_line),")
        [void]$sb.AppendLine("    category: '$cat',")
        [void]$sb.AppendLine("    bucket: '$([string]$f.bucket)',")
        [void]$sb.AppendLine("    description: $specJson,")
        [void]$sb.AppendLine("    status: 'enabled-from-itemwise-block',")
        [void]$sb.AppendLine("    implemented: false")
        [void]$sb.AppendLine("  };")
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine("  if (typeof router !== 'undefined' && router && typeof router.get === 'function') {")
        [void]$sb.AppendLine("    router.__futureFeatureRouteRegistry = router.__futureFeatureRouteRegistry || {};")
        [void]$sb.AppendLine("    if (!router.__futureFeatureRouteRegistry[FUTURE_FEATURE_BLOCK_KEY]) {")
        [void]$sb.AppendLine("      router.__futureFeatureRouteRegistry[FUTURE_FEATURE_BLOCK_KEY] = true;")
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine("      router.get(FUTURE_FEATURE_BASE_PATH + '/catalog', (req, res) => {")
        [void]$sb.AppendLine("        return res.status(200).json({")
        [void]$sb.AppendLine("          category: FUTURE_FEATURE_CATEGORY,")
        [void]$sb.AppendLine("          blockKey: FUTURE_FEATURE_BLOCK_KEY,")
        [void]$sb.AppendLine("          count: 1,")
        [void]$sb.AppendLine("          features: [FEATURE]")
        [void]$sb.AppendLine("        });")
        [void]$sb.AppendLine("      });")
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine("      router.get(FUTURE_FEATURE_BASE_PATH + '/catalog/' + FEATURE.featureId, (req, res) => {")
        [void]$sb.AppendLine("        return res.status(200).json({")
        [void]$sb.AppendLine("          category: FUTURE_FEATURE_CATEGORY,")
        [void]$sb.AppendLine("          blockKey: FUTURE_FEATURE_BLOCK_KEY,")
        [void]$sb.AppendLine("          featureId: FEATURE.featureId,")
        [void]$sb.AppendLine("          sourceLine: FEATURE.sourceLine,")
        [void]$sb.AppendLine("          description: FEATURE.description,")
        [void]$sb.AppendLine("          activation: 'ready',")
        [void]$sb.AppendLine("          note: 'Single feature item block is active.'")
        [void]$sb.AppendLine("        });")
        [void]$sb.AppendLine("      });")
        [void]$sb.AppendLine("    }")
        [void]$sb.AppendLine("  }")
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine("  if (typeof window !== 'undefined') {")
        [void]$sb.AppendLine("    window.__GOINDIARIDE_FUTURE_FEATURES = window.__GOINDIARIDE_FUTURE_FEATURES || {};")
        [void]$sb.AppendLine("    window.__GOINDIARIDE_FUTURE_FEATURES[FUTURE_FEATURE_BLOCK_KEY] = [FEATURE];")
        [void]$sb.AppendLine("    window.__GOINDIARIDE_FUTURE_FEATURES_BY_CATEGORY = window.__GOINDIARIDE_FUTURE_FEATURES_BY_CATEGORY || {};")
        [void]$sb.AppendLine("    window.__GOINDIARIDE_FUTURE_FEATURES_BY_CATEGORY[FUTURE_FEATURE_CATEGORY] = window.__GOINDIARIDE_FUTURE_FEATURES_BY_CATEGORY[FUTURE_FEATURE_CATEGORY] || {};")
        [void]$sb.AppendLine("    window.__GOINDIARIDE_FUTURE_FEATURES_BY_CATEGORY[FUTURE_FEATURE_CATEGORY][FUTURE_FEATURE_BLOCK_KEY] = [FEATURE];")
        [void]$sb.AppendLine("    if (typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') {")
        [void]$sb.AppendLine("      window.dispatchEvent(new CustomEvent('goindiaride:future-feature-item-ready', {")
        [void]$sb.AppendLine("        detail: {")
        [void]$sb.AppendLine("          category: FUTURE_FEATURE_CATEGORY,")
        [void]$sb.AppendLine("          blockKey: FUTURE_FEATURE_BLOCK_KEY,")
        [void]$sb.AppendLine("          featureId: FEATURE.featureId")
        [void]$sb.AppendLine("        }")
        [void]$sb.AppendLine("      }));")
        [void]$sb.AppendLine("    }")
        [void]$sb.AppendLine("  }")
        [void]$sb.AppendLine("})();")
        [void]$sb.AppendLine("*/")
        [void]$sb.AppendLine("// === FUTURE_FEATURE_ITEM_END: $blockKey ===")
        [void]$sb.AppendLine("")
    }

    $targetFile = $outputFiles[$cat]
    $targetDir = Split-Path -Parent $targetFile
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    [System.IO.File]::WriteAllText($targetFile, $sb.ToString(), [System.Text.UTF8Encoding]::new($true))
}

$summaryFile = Join-Path $RepoRoot "feature-pack\07-audit\ITEMWISE-FEATURE-SUMMARY.csv"
$summaryRows | Sort-Object category, featureId | Export-Csv -Path $summaryFile -NoTypeInformation -Encoding UTF8

Write-Output "Generated item-wise disabled scaffolds."
Write-Output "Summary: $summaryFile"
