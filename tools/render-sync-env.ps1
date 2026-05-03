param(
  [Parameter(Mandatory = $true)]
  [string]$RenderApiKey,

  [string]$ServiceId = "srv-d7nfsd8sfn5c73e1jqt0",
  [string]$EnvFile = "backend/.env",
  [switch]$TriggerDeploy = $true,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $EnvFile)) {
  throw "Env file not found: $EnvFile"
}

function Parse-EnvFile {
  param([string]$Path)
  $pairs = @{}
  $lines = Get-Content -LiteralPath $Path
  foreach ($line in $lines) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line.TrimStart().StartsWith("#")) { continue }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { continue }

    $key = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1)

    if ([string]::IsNullOrWhiteSpace($key)) { continue }
    $pairs[$key] = $value
  }
  return $pairs
}

$envPairs = Parse-EnvFile -Path $EnvFile
if ($envPairs.Count -eq 0) {
  throw "No KEY=VALUE entries found in $EnvFile"
}

$requiredKeys = @("MONGO_URI", "JWT_SECRET", "FIREBASE_KEY")
$missingRequired = @()
foreach ($key in $requiredKeys) {
  if (-not $envPairs.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($envPairs[$key])) {
    $missingRequired += $key
  }
}
if ($missingRequired.Count -gt 0) {
  throw "Missing required keys in ${EnvFile}: $($missingRequired -join ', ')"
}

$headers = @{
  Authorization = "Bearer $RenderApiKey"
  Accept = "application/json"
  "Content-Type" = "application/json"
}

Write-Host "Sync target service: $ServiceId"
Write-Host "Source env file: $EnvFile"
Write-Host "Keys to sync: $($envPairs.Count)"

$ok = 0
$failed = @()

foreach ($entry in $envPairs.GetEnumerator()) {
  $key = [string]$entry.Key
  $value = [string]$entry.Value
  $uri = "https://api.render.com/v1/services/$ServiceId/env-vars/$key"
  $body = @{ value = $value } | ConvertTo-Json -Compress

  if ($DryRun) {
    Write-Host "[DRY-RUN] Would sync key: $key"
    $ok++
    continue
  }

  try {
    Invoke-RestMethod -Method Put -Uri $uri -Headers $headers -Body $body | Out-Null
    Write-Host "Synced: $key"
    $ok++
  } catch {
    Write-Warning "Failed: $key -> $($_.Exception.Message)"
    $failed += $key
  }
}

Write-Host "Sync summary: success=$ok failed=$($failed.Count)"
if ($failed.Count -gt 0) {
  Write-Warning "Failed keys: $($failed -join ', ')"
  throw "Render env sync incomplete."
}

if ($TriggerDeploy -and -not $DryRun) {
  $deployUri = "https://api.render.com/v1/services/$ServiceId/deploys"
  $deployBody = @{ clearCache = "do_not_clear"; deployMode = "build_and_deploy" } | ConvertTo-Json -Compress
  $deployResp = Invoke-RestMethod -Method Post -Uri $deployUri -Headers $headers -Body $deployBody

  if ($deployResp.id) {
    Write-Host "Deploy triggered: $($deployResp.id)"
  } else {
    Write-Host "Deploy trigger requested."
  }
}

Write-Host "Render env sync completed."
