param(
    [string]$RepoRoot = "C:\Users\Dhaval Gajjar\Desktop\GOindiaRIDE"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Upsert-BlockInJsFile {
    param(
        [Parameter(Mandatory = $true)][string]$TargetFile,
        [Parameter(Mandatory = $true)][string]$MarkerKey,
        [Parameter(Mandatory = $true)][string]$BlockContent
    )

    if (-not (Test-Path -LiteralPath $TargetFile)) {
        throw "Target JS file not found: $TargetFile"
    }

    $startMarker = "// === FUTURE_FEATURES_$MarkerKey`_START ==="
    $endMarker = "// === FUTURE_FEATURES_$MarkerKey`_END ==="
    $content = Get-Content -LiteralPath $TargetFile -Raw
    $insertBlock = $startMarker + [Environment]::NewLine + $BlockContent.TrimEnd() + [Environment]::NewLine + $endMarker

    $startPattern = [regex]::Escape($startMarker)
    $endPattern = [regex]::Escape($endMarker)
    $replacePattern = "(?s)$startPattern.*?$endPattern"

    if ($content -match $startPattern -and $content -match $endPattern) {
        $content = [regex]::Replace($content, $replacePattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $insertBlock }, 1)
    }
    else {
        $anchor = "module.exports = router;"
        if ($content.Contains($anchor)) {
            $content = $content.Replace($anchor, $insertBlock + [Environment]::NewLine + [Environment]::NewLine + $anchor)
        }
        else {
            $content = $content.TrimEnd() + [Environment]::NewLine + [Environment]::NewLine + $insertBlock + [Environment]::NewLine
        }
    }

    [System.IO.File]::WriteAllText($TargetFile, $content, [System.Text.UTF8Encoding]::new($true))
}

function Upsert-BlockInHtmlFile {
    param(
        [Parameter(Mandatory = $true)][string]$TargetFile,
        [Parameter(Mandatory = $true)][string]$MarkerKey,
        [Parameter(Mandatory = $true)][string]$BlockContent,
        [Parameter(Mandatory = $true)][string]$ScriptId
    )

    if (-not (Test-Path -LiteralPath $TargetFile)) {
        throw "Target HTML file not found: $TargetFile"
    }

    $startMarker = "<!-- === FUTURE_FEATURES_$MarkerKey`_START === -->"
    $endMarker = "<!-- === FUTURE_FEATURES_$MarkerKey`_END === -->"
    $content = Get-Content -LiteralPath $TargetFile -Raw

    $scriptBlock = @(
        $startMarker
        "<script id=""$ScriptId"">"
        $BlockContent.TrimEnd()
        "</script>"
        $endMarker
    ) -join [Environment]::NewLine

    $startPattern = [regex]::Escape($startMarker)
    $endPattern = [regex]::Escape($endMarker)
    $replacePattern = "(?s)$startPattern.*?$endPattern"

    if ($content -match $startPattern -and $content -match $endPattern) {
        $content = [regex]::Replace($content, $replacePattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $scriptBlock }, 1)
    }
    else {
        $anchor = "</body>"
        if ($content.Contains($anchor)) {
            $content = $content.Replace($anchor, $scriptBlock + [Environment]::NewLine + [Environment]::NewLine + $anchor)
        }
        else {
            $content = $content.TrimEnd() + [Environment]::NewLine + [Environment]::NewLine + $scriptBlock + [Environment]::NewLine
        }
    }

    [System.IO.File]::WriteAllText($TargetFile, $content, [System.Text.UTF8Encoding]::new($true))
}

$map = @(
    @{
        kind = "js"
        key = "SECURITY"
        source = Join-Path $RepoRoot "feature-pack\01-security\disabled-feature-code.js"
        target = Join-Path $RepoRoot "backend\src\routes\securityRoutes.js"
    },
    @{
        kind = "js"
        key = "SECURITY_AUTH_ROOT"
        source = Join-Path $RepoRoot "feature-pack\01-security\disabled-feature-code.js"
        target = Join-Path $RepoRoot "backend\src\routes\authRoutes.js"
    },
    @{
        kind = "html"
        key = "CUSTOMER"
        scriptId = "future-features-customer-disabled"
        source = Join-Path $RepoRoot "feature-pack\02-customer\disabled-feature-code.js"
        target = Join-Path $RepoRoot "pages\customer-dashboard.html"
    },
    @{
        kind = "html"
        key = "CUSTOMER_ROOT"
        scriptId = "future-features-customer-root-disabled"
        source = Join-Path $RepoRoot "feature-pack\02-customer\disabled-feature-code.js"
        target = Join-Path $RepoRoot "customer\index.html"
    },
    @{
        kind = "html"
        key = "DRIVER"
        scriptId = "future-features-driver-disabled"
        source = Join-Path $RepoRoot "feature-pack\03-driver\disabled-feature-code.js"
        target = Join-Path $RepoRoot "pages\driver-dashboard.html"
    },
    @{
        kind = "html"
        key = "DRIVER_ROOT"
        scriptId = "future-features-driver-root-disabled"
        source = Join-Path $RepoRoot "feature-pack\03-driver\disabled-feature-code.js"
        target = Join-Path $RepoRoot "driver\index.html"
    },
    @{
        kind = "html"
        key = "ADMIN"
        scriptId = "future-features-admin-disabled"
        source = Join-Path $RepoRoot "feature-pack\04-admin\disabled-feature-code.js"
        target = Join-Path $RepoRoot "pages\admin-dashboard.html"
    },
    @{
        kind = "html"
        key = "ADMIN_ROOT"
        scriptId = "future-features-admin-root-disabled"
        source = Join-Path $RepoRoot "feature-pack\04-admin\disabled-feature-code.js"
        target = Join-Path $RepoRoot "admin\index.html"
    },
    @{
        kind = "html"
        key = "ADDITIONAL"
        scriptId = "future-features-additional-disabled"
        source = Join-Path $RepoRoot "feature-pack\05-additional\disabled-feature-code.js"
        target = Join-Path $RepoRoot "pages\booking.html"
    },
    @{
        kind = "html"
        key = "ADDITIONAL_ROOT"
        scriptId = "future-features-additional-root-disabled"
        source = Join-Path $RepoRoot "feature-pack\05-additional\disabled-feature-code.js"
        target = Join-Path $RepoRoot "customer\index.html"
    }
)

foreach ($item in $map) {
    if (-not (Test-Path -LiteralPath $item.source)) {
        throw "Source block missing: $($item.source)"
    }
    $block = Get-Content -LiteralPath $item.source -Raw

    if ($item.kind -eq "js") {
        Upsert-BlockInJsFile -TargetFile $item.target -MarkerKey $item.key -BlockContent $block
    }
    else {
        Upsert-BlockInHtmlFile -TargetFile $item.target -MarkerKey $item.key -BlockContent $block -ScriptId $item.scriptId
    }
}

Write-Output "Injected disabled future-feature blocks into live files."
