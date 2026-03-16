param(
    [string]$RepoRoot = "C:\Users\Dhaval Gajjar\Desktop\GOindiaRIDE"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-FileUtf8 {
    param([Parameter(Mandatory = $true)][string]$Path)
    return [System.IO.File]::ReadAllText($Path)
}

function Write-FileUtf8 {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($true))
}

function Activate-FeatureItemBlocks {
    param(
        [Parameter(Mandatory = $true)][string]$Content
    )

    $pattern = '(?s)(// === FUTURE_FEATURE_ITEM_START:[^\r\n]*===\r?\n)\s*/\*\r?\n(.*?)\r?\n\s*\*/\r?\n(// === FUTURE_FEATURE_ITEM_END:[^\r\n]*===)'
    return [regex]::Replace($Content, $pattern, {
        param($m)
        $start = $m.Groups[1].Value
        $body = $m.Groups[2].Value
        $end = $m.Groups[3].Value
        return $start + $body + [Environment]::NewLine + $end
    })
}

function Activate-RouteBlocks {
    param(
        [Parameter(Mandatory = $true)][string]$Content
    )

    $pattern = '(?s)(// === FUTURE_ROUTES_[A-Z_]+_START ===\r?\n)\s*/\*\r?\n(.*?)\r?\n\s*\*/\r?\n(// === FUTURE_ROUTES_[A-Z_]+_END ===)'
    return [regex]::Replace($Content, $pattern, {
        param($m)
        $start = $m.Groups[1].Value
        $body = $m.Groups[2].Value
        $end = $m.Groups[3].Value
        return $start + $body + [Environment]::NewLine + $end
    })
}

function Activate-RuntimeMovedBundle {
    param(
        [Parameter(Mandatory = $true)][string]$Content
    )

    $pattern = '(?s)(<script id="future-runtime-moved-disabled">\r?\n)\s*/\*\r?\n(.*?)\r?\n\s*\*/(\r?\n</script>)'
    return [regex]::Replace($Content, $pattern, {
        param($m)
        $openScript = $m.Groups[1].Value
        $body = $m.Groups[2].Value
        $closeScript = $m.Groups[3].Value

        $lines = $body -split "\r?\n"
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match '^\s*MOVED FROM:') {
                $lines[$i] = '// ' + ($lines[$i].Trim())
            }
            elseif ($lines[$i] -match '^\s*Enable karne ke liye') {
                $lines[$i] = '// ' + ($lines[$i].Trim())
            }
        }

        $activatedBody = ($lines -join [Environment]::NewLine).TrimEnd()
        return $openScript + $activatedBody + $closeScript
    })
}

$featureItemFiles = @(
    "backend/src/routes/authRoutes.js",
    "backend/src/routes/securityRoutes.js",
    "customer/index.html",
    "driver/index.html",
    "admin/index.html",
    "pages/customer-dashboard.html",
    "pages/driver-dashboard.html",
    "pages/admin-dashboard.html",
    "pages/booking.html"
) | ForEach-Object { Join-Path $RepoRoot $_ }

$routeFiles = @(
    "backend/src/routes/walletRoutes.js",
    "backend/src/routes/authRoutes.js",
    "backend/src/routes/notificationRoutes.js",
    "backend/src/routes/bookingRoutes.js",
    "backend/src/routes/securityRoutes.js",
    "backend/src/routes/adminRoutes.js",
    "backend/src/routes/userRoutes.js"
) | ForEach-Object { Join-Path $RepoRoot $_ }

$runtimeBundleFiles = @(
    "customer/index.html",
    "driver/index.html",
    "admin/index.html",
    "pages/customer-dashboard.html",
    "pages/driver-dashboard.html",
    "pages/admin-dashboard.html",
    "pages/booking.html"
) | ForEach-Object { Join-Path $RepoRoot $_ }

$allTargets = @($featureItemFiles + $routeFiles + $runtimeBundleFiles | Select-Object -Unique)

foreach ($file in $allTargets) {
    if (-not (Test-Path -LiteralPath $file)) {
        throw "Missing target file: $file"
    }

    $content = Read-FileUtf8 -Path $file
    $updated = $content

    if ($featureItemFiles -contains $file) {
        $updated = Activate-FeatureItemBlocks -Content $updated
    }
    if ($routeFiles -contains $file) {
        $updated = Activate-RouteBlocks -Content $updated
    }
    if ($runtimeBundleFiles -contains $file) {
        $updated = Activate-RuntimeMovedBundle -Content $updated
    }

    if ($updated -ne $content) {
        Write-FileUtf8 -Path $file -Content $updated
        Write-Output ("Activated future blocks in: {0}" -f $file)
    }
}

Write-Output "Activation complete: all configured future feature blocks are live in root files."
