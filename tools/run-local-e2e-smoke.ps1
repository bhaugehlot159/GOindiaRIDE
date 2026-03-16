param(
    [string]$BackendUrl = "http://127.0.0.1:5000",
    [int]$StartupTimeoutSec = 90,
    [switch]$UseExistingServer
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Load-DotEnv {
    param([Parameter(Mandatory = $true)][string]$Path)
    $vars = @{}
    if (-not (Test-Path -LiteralPath $Path)) {
        return $vars
    }

    Get-Content -Path $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        $eq = $line.IndexOf("=")
        if ($eq -lt 1) { return }
        $key = $line.Substring(0, $eq).Trim()
        $value = $line.Substring($eq + 1).Trim()
        if ($value.StartsWith('"') -and $value.EndsWith('"') -and $value.Length -ge 2) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $vars[$key] = $value
    }
    return $vars
}

function Read-ErrorResponseBody {
    param($Exception)
    try {
        $stream = $Exception.Response.GetResponseStream()
        if ($null -eq $stream) { return $Exception.Message }
        $reader = New-Object System.IO.StreamReader($stream)
        return $reader.ReadToEnd()
    } catch {
        return $Exception.Message
    }
}

function Invoke-Api {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [object]$Body = $null,
        [hashtable]$Headers = @{},
        [Parameter(Mandatory = $true)]$Session,
        [Parameter(Mandatory = $true)][string]$BaseUrl
    )

    $uri = "$BaseUrl$Path"
    $params = @{
        Uri = $uri
        Method = $Method
        WebSession = $Session
        Headers = $Headers
        TimeoutSec = 25
        UseBasicParsing = $true
    }

    if ($null -ne $Body) {
        $params.ContentType = "application/json"
        $params.Body = ($Body | ConvertTo-Json -Depth 15)
    }

    try {
        $resp = Invoke-WebRequest @params
        $json = $null
        try { $json = $resp.Content | ConvertFrom-Json -ErrorAction Stop } catch {}
        return [pscustomobject]@{
            Status = [int]$resp.StatusCode
            Json = $json
            Content = $resp.Content
            Error = $null
        }
    } catch {
        $status = 0
        if ($_.Exception.Response) {
            try { $status = [int]$_.Exception.Response.StatusCode } catch { $status = 0 }
        }
        $raw = Read-ErrorResponseBody -Exception $_.Exception
        $json = $null
        try { $json = $raw | ConvertFrom-Json -ErrorAction Stop } catch {}
        return [pscustomobject]@{
            Status = $status
            Json = $json
            Content = $raw
            Error = $_.Exception.Message
        }
    }
}

function Wait-ForHealth {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][int]$TimeoutSec
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri "$Url/health" -Method GET -TimeoutSec 5 -UseBasicParsing
            if ([int]$r.StatusCode -eq 200) {
                return $true
            }
        } catch {}
        Start-Sleep -Seconds 2
    }
    return $false
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendDir = Join-Path $repoRoot "backend"
$envPath = Join-Path $backendDir ".env"
$tmpDir = Join-Path $backendDir "tmp"
if (-not (Test-Path -LiteralPath $tmpDir)) {
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
}

$serverJob = $null

try {
    $effectiveBackendUrl = $BackendUrl
    if (-not $UseExistingServer) {
        if (-not (Test-Path -LiteralPath $envPath)) {
            throw "backend/.env not found. Create it first from backend/.env.example."
        }

        $dotenv = Load-DotEnv -Path $envPath
        foreach ($required in @("MONGO_URI", "JWT_SECRET", "FIREBASE_KEY")) {
            if (-not $dotenv.ContainsKey($required) -or -not $dotenv[$required]) {
                throw "Missing required env in backend/.env: $required"
            }
        }

        $portValue = if ($dotenv.ContainsKey("PORT")) { $dotenv["PORT"] } else { "" }
        if ($BackendUrl -eq "http://127.0.0.1:5000" -and $portValue) {
            $effectiveBackendUrl = "http://127.0.0.1:$portValue"
            Write-Host "Using backend URL from .env PORT: $effectiveBackendUrl"
        }
        $serverJob = Start-Job -Name "goindiaride-e2e-smoke-backend" -ScriptBlock {
            param($dir, $mongoUri, $jwtSecret, $firebaseKey, $port)
            Set-Location $dir
            $env:MONGO_URI = $mongoUri
            $env:JWT_SECRET = $jwtSecret
            $env:FIREBASE_KEY = $firebaseKey
            if ($port) { $env:PORT = $port }
            $env:NODE_ENV = "development"
            node src/server.js
        } -ArgumentList $backendDir, $dotenv["MONGO_URI"], $dotenv["JWT_SECRET"], $dotenv["FIREBASE_KEY"], $portValue

        Write-Host "Started backend Job Id: $($serverJob.Id)"
        $healthy = Wait-ForHealth -Url $effectiveBackendUrl -TimeoutSec $StartupTimeoutSec
        if (-not $healthy) {
            $jobTail = @()
            if ($serverJob) {
                $jobTail = Receive-Job -Job $serverJob -Keep -ErrorAction SilentlyContinue | Select-Object -Last 60
            }
            throw ("Backend health check failed.`nJOB OUTPUT:`n{0}" -f ($jobTail -join "`n"))
        }
    }

    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $results = New-Object System.Collections.Generic.List[object]

    function Add-Result {
        param(
            [string]$Name,
            [object]$Response,
            [int[]]$Expected
        )
        $pass = $Expected -contains [int]$Response.Status
        $results.Add([pscustomobject]@{
            Step = $Name
            Status = $Response.Status
            Expected = ($Expected -join ",")
            Pass = $pass
            Error = $Response.Error
        })
        if ($pass) {
            Write-Host ("PASS  {0} -> {1}" -f $Name, $Response.Status) -ForegroundColor Green
        } else {
            Write-Host ("FAIL  {0} -> {1} (expected: {2})" -f $Name, $Response.Status, ($Expected -join ",")) -ForegroundColor Red
        }
    }

    $stamp = Get-Date -Format "yyyyMMddHHmmss"
    $suffix = Get-Random -Minimum 1000 -Maximum 9999
    $smokeUserKey = "smoke-user-$stamp-$suffix"
    $smokePhone = "9" + (Get-Random -Minimum 100000000 -Maximum 999999999)
    $smokeEmail = "smoke.$stamp.$suffix@example.com"
    $smokePassword = "Smoke#12345"

    $health = Invoke-Api -Method GET -Path "/health" -Session $session -BaseUrl $effectiveBackendUrl
    Add-Result -Name "GET /health" -Response $health -Expected @(200)

    $csrf = Invoke-Api -Method GET -Path "/api/security/csrf-token" -Session $session -BaseUrl $effectiveBackendUrl
    Add-Result -Name "GET /api/security/csrf-token" -Response $csrf -Expected @(200)

    $activate = Invoke-Api -Method POST -Path "/api/future-runtime/activate" -Session $session -BaseUrl $effectiveBackendUrl -Body @{
        source = "e2e-smoke"
        detail = @{ mode = "smoke" }
        feature = @{
            featureId = "FSMOKE"
            category = "additional"
            blockKey = "smoke-block"
            description = "E2E smoke feature activation"
            implemented = $true
            status = "smoke-active"
            pagePath = "/pages/booking.html"
        }
    }
    Add-Result -Name "POST /api/future-runtime/activate" -Response $activate -Expected @(200, 201)

    $rtStatus = Invoke-Api -Method GET -Path "/api/future-runtime/status" -Session $session -BaseUrl $effectiveBackendUrl
    Add-Result -Name "GET /api/future-runtime/status" -Response $rtStatus -Expected @(200)

    $rtExecute = Invoke-Api -Method POST -Path "/api/future-runtime/execute/FSMOKE" -Session $session -BaseUrl $effectiveBackendUrl -Body @{
        action = "smoke-run"
        category = "additional"
        payload = @{ userKey = $smokeUserKey }
    }
    Add-Result -Name "POST /api/future-runtime/execute/FSMOKE" -Response $rtExecute -Expected @(200)

    $bizStatus = Invoke-Api -Method GET -Path "/api/future-runtime-business/status" -Session $session -BaseUrl $effectiveBackendUrl
    Add-Result -Name "GET /api/future-runtime-business/status" -Response $bizStatus -Expected @(200)

    $walletTopup = Invoke-Api -Method POST -Path "/api/future-runtime-business/wallet/topup" -Session $session -BaseUrl $effectiveBackendUrl -Body @{
        userKey = $smokeUserKey
        amount = 250
        method = "smoke"
        note = "e2e-topup"
    }
    Add-Result -Name "POST /api/future-runtime-business/wallet/topup" -Response $walletTopup -Expected @(200)

    $walletGet = Invoke-Api -Method GET -Path "/api/future-runtime-business/wallet/$smokeUserKey" -Session $session -BaseUrl $effectiveBackendUrl
    Add-Result -Name "GET /api/future-runtime-business/wallet/{userKey}" -Response $walletGet -Expected @(200)

    $featureStateSave = Invoke-Api -Method POST -Path "/api/future-runtime-business/feature/state" -Session $session -BaseUrl $effectiveBackendUrl -Body @{
        userKey = $smokeUserKey
        featureId = "FSMOKE"
        category = "additional"
        status = "active"
        owner = "smoke"
    }
    Add-Result -Name "POST /api/future-runtime-business/feature/state" -Response $featureStateSave -Expected @(200)

    $featureStateGet = Invoke-Api -Method GET -Path "/api/future-runtime-business/feature/state/FSMOKE?userKey=$smokeUserKey" -Session $session -BaseUrl $effectiveBackendUrl
    Add-Result -Name "GET /api/future-runtime-business/feature/state/FSMOKE" -Response $featureStateGet -Expected @(200)

    $notifySend = Invoke-Api -Method POST -Path "/api/future-runtime-business/notifications/send" -Session $session -BaseUrl $effectiveBackendUrl -Body @{
        userKey = $smokeUserKey
        title = "Smoke Notification"
        message = "Smoke run"
        channel = "in_app"
    }
    Add-Result -Name "POST /api/future-runtime-business/notifications/send" -Response $notifySend -Expected @(200)

    $notifyGet = Invoke-Api -Method GET -Path "/api/future-runtime-business/notifications/$smokeUserKey" -Session $session -BaseUrl $effectiveBackendUrl
    Add-Result -Name "GET /api/future-runtime-business/notifications/{userKey}" -Response $notifyGet -Expected @(200)

    $fare = Invoke-Api -Method POST -Path "/api/future-runtime-business/fare/estimate" -Session $session -BaseUrl $effectiveBackendUrl -Body @{
        distanceKm = 18
        durationMin = 35
        vehicleType = "sedan"
        currency = "INR"
    }
    Add-Result -Name "POST /api/future-runtime-business/fare/estimate" -Response $fare -Expected @(200)

    $districts = Invoke-Api -Method GET -Path "/api/future-runtime-business/districts/full" -Session $session -BaseUrl $effectiveBackendUrl
    Add-Result -Name "GET /api/future-runtime-business/districts/full" -Response $districts -Expected @(200)

    $register = Invoke-Api -Method POST -Path "/api/auth/register" -Session $session -BaseUrl $effectiveBackendUrl -Body @{
        name = "Smoke User"
        email = $smokeEmail
        phone = $smokePhone
        password = $smokePassword
        accountType = "customer"
        recaptchaToken = "smoke-token"
        submittedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - 5000
    }
    Add-Result -Name "POST /api/auth/register" -Response $register -Expected @(201, 409)

    $login = Invoke-Api -Method POST -Path "/api/auth/login" -Session $session -BaseUrl $effectiveBackendUrl -Body @{
        email = $smokeEmail
        password = $smokePassword
    }
    Add-Result -Name "POST /api/auth/login" -Response $login -Expected @(200)

    $token = $null
    if ($login.Status -eq 200 -and $login.Json -and $login.Json.accessToken) {
        $token = [string]$login.Json.accessToken
    }

    if ($token) {
        $profile = Invoke-Api -Method GET -Path "/api/users/profile" -Session $session -BaseUrl $effectiveBackendUrl -Headers @{
            Authorization = "Bearer $token"
        }
        Add-Result -Name "GET /api/users/profile" -Response $profile -Expected @(200)
    } else {
        $results.Add([pscustomobject]@{
            Step = "GET /api/users/profile"
            Status = 0
            Expected = "200"
            Pass = $false
            Error = "Skipped because login did not return accessToken"
        })
        Write-Host "FAIL  GET /api/users/profile -> skipped (no accessToken)" -ForegroundColor Red
    }

    $total = $results.Count
    $passed = ($results | Where-Object { $_.Pass }).Count
    $failed = $total - $passed

    Write-Host ""
    Write-Host "==== E2E Smoke Summary ===="
    Write-Host ("Total:  {0}" -f $total)
    Write-Host ("Passed: {0}" -f $passed)
    Write-Host ("Failed: {0}" -f $failed)

    if ($failed -gt 0) {
        Write-Host ""
        Write-Host "Failed Steps:" -ForegroundColor Red
        $results | Where-Object { -not $_.Pass } | ForEach-Object {
            Write-Host ("- {0} | status={1} | expected={2} | error={3}" -f $_.Step, $_.Status, $_.Expected, $_.Error)
        }
        exit 1
    }

    Write-Host "All smoke checks passed." -ForegroundColor Green
    exit 0
}
finally {
    if ($serverJob) {
        try {
            Stop-Job -Job $serverJob -Force | Out-Null
        } catch {}
        Remove-Job -Job $serverJob -Force -ErrorAction SilentlyContinue
        Write-Host "Stopped backend job."
    }
}
