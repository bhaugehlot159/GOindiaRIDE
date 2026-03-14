param(
    [string]$RepoRoot = "C:\Users\Dhaval Gajjar\Desktop\GOindiaRIDE"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$targets = @(
    @{ path = Join-Path $RepoRoot "backend\src\routes\securityRoutes.js"; kind = "js" },
    @{ path = Join-Path $RepoRoot "backend\src\routes\authRoutes.js"; kind = "js" },
    @{ path = Join-Path $RepoRoot "customer\index.html"; kind = "html" },
    @{ path = Join-Path $RepoRoot "driver\index.html"; kind = "html" },
    @{ path = Join-Path $RepoRoot "admin\index.html"; kind = "html" },
    @{ path = Join-Path $RepoRoot "pages\booking.html"; kind = "html" },
    @{ path = Join-Path $RepoRoot "pages\customer-dashboard.html"; kind = "html" },
    @{ path = Join-Path $RepoRoot "pages\driver-dashboard.html"; kind = "html" },
    @{ path = Join-Path $RepoRoot "pages\admin-dashboard.html"; kind = "html" }
)

foreach ($item in $targets) {
    $targetPath = [string]$item.path
    if (-not (Test-Path -LiteralPath $targetPath)) {
        throw "Target file missing: $targetPath"
    }

    $content = Get-Content -LiteralPath $targetPath -Raw

    if ($item.kind -eq "html") {
        $pattern = '(?s)\s*<!-- === FUTURE_FEATURES_(?![A-Z_]*ITEMWISE)[A-Z_]+_START === -->.*?<!-- === FUTURE_FEATURES_[A-Z_]+_END === -->\s*'
    }
    else {
        $pattern = '(?s)\s*// === FUTURE_FEATURES_(?![A-Z_]*ITEMWISE)[A-Z_]+_START ===.*?// === FUTURE_FEATURES_[A-Z_]+_END ===\s*'
    }

    $matchCount = ([regex]::Matches($content, $pattern)).Count
    if ($matchCount -gt 0) {
        $content = [regex]::Replace($content, $pattern, [Environment]::NewLine + [Environment]::NewLine)
        $content = [regex]::Replace($content, "(\r?\n){3,}", [Environment]::NewLine + [Environment]::NewLine)
        [System.IO.File]::WriteAllText($targetPath, $content, [System.Text.UTF8Encoding]::new($true))
    }

    Write-Output ("{0} => removed_non_itemwise_blocks={1}" -f $targetPath, $matchCount)
}

Write-Output "Cleanup complete: non-itemwise scaffold blocks removed from live files."
