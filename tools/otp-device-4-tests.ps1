param(
  [string]$BaseUrl = "http://127.0.0.1:5000/api/auth",
  [ValidateSet("sms", "email")]
  [string]$Channel = "sms",
  [ValidateSet("customer", "driver", "admin")]
  [string]$AccountType = "customer",
  [string]$Phone = "",
  [string]$Email = "",
  [string]$FingerprintA = "fp-A-auto-001",
  [string]$FingerprintB = "fp-B-auto-002",
  [int]$RequestTimeoutSec = 10
)

$ErrorActionPreference = "Stop"

function New-IdentifierPayload {
  param(
    [string]$ForChannel,
    [string]$ForPhone,
    [string]$ForEmail
  )

  if ($ForChannel -eq "email") {
    return @{ email = $ForEmail }
  }

  return @{ phone = $ForPhone }
}

function Invoke-JsonPost {
  param(
    [string]$Url,
    [hashtable]$Body
  )

  $json = $Body | ConvertTo-Json -Compress

  try {
    $res = Invoke-WebRequest -Uri $Url -Method POST -ContentType "application/json" -Body $json -UseBasicParsing -TimeoutSec $RequestTimeoutSec
    $status = [int]$res.StatusCode
    $content = [string]$res.Content
  } catch {
    $resp = $_.Exception.Response
    if (-not $resp) {
      throw
    }
    $status = [int]$resp.StatusCode
    $content = $_.ErrorDetails.Message
    if (-not $content) {
      $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
      $content = $reader.ReadToEnd()
    }
  }

  $obj = $null
  try { $obj = $content | ConvertFrom-Json } catch {}

  return [PSCustomObject]@{
    Status = $status
    Body = $content
    Json = $obj
  }
}

function Request-OtpWithRetry {
  param(
    [string]$RequestUrl,
    [hashtable]$BasePayload
  )

  for ($attempt = 1; $attempt -le 6; $attempt++) {
    $response = Invoke-JsonPost -Url $RequestUrl -Body $BasePayload
    if ($response.Status -eq 200 -and $response.Json -and $response.Json.devOtp) {
      return $response
    }

    if ($response.Status -eq 429) {
      $waitSeconds = 31
      $msg = [string]$response.Json.message
      if ($msg -match "(\d+)\s*seconds") {
        $waitSeconds = [int]$Matches[1] + 1
      }
      Write-Host "Cooldown active, waiting $waitSeconds sec..."
      Start-Sleep -Seconds $waitSeconds
      continue
    }

    throw "request-otp failed (status=$($response.Status)): $($response.Body)"
  }

  throw "request-otp cooldown did not clear after retries."
}

function Add-Result {
  param(
    [System.Collections.ArrayList]$List,
    [string]$Name,
    [bool]$Pass,
    [string]$Expected,
    [string]$Actual
  )

  [void]$List.Add([PSCustomObject]@{
    Test = $Name
    Pass = if ($Pass) { "PASS" } else { "FAIL" }
    Expected = $Expected
    Actual = $Actual
  })
}

# Check backend health first
try {
  $health = Invoke-WebRequest -Uri ($BaseUrl -replace "/api/auth$", "/health") -Method GET -UseBasicParsing -TimeoutSec $RequestTimeoutSec
  if ([int]$health.StatusCode -ne 200) {
    throw "Health check returned status $($health.StatusCode)"
  }
} catch {
  throw "Backend not reachable. Start backend first and retry. Details: $($_.Exception.Message)"
}

if ($Channel -eq "email") {
  if (-not $Email) {
    $Email = "qa.$(Get-Random -Minimum 10000000 -Maximum 99999999)@example.com"
  }
} else {
  if (-not $Phone) {
    $Phone = "9$(Get-Random -Minimum 100000000 -Maximum 999999999)"
  }
}

$idPayload = New-IdentifierPayload -ForChannel $Channel -ForPhone $Phone -ForEmail $Email
$reqOtpBody = @{
  channel = $Channel
  accountType = $AccountType
} + $idPayload

$verifyBaseBody = @{
  channel = $Channel
  accountType = $AccountType
} + $idPayload

Write-Host "Running OTP device tests..."
Write-Host "BaseUrl: $BaseUrl"
if ($Channel -eq "email") {
  Write-Host "Identifier(email): $Email"
} else {
  Write-Host "Identifier(phone): $Phone"
}

$results = New-Object System.Collections.ArrayList

# Test 1: missing fingerprint
$t1Body = $verifyBaseBody.Clone()
$t1Body.otp = "111111"
$t1 = Invoke-JsonPost -Url "$BaseUrl/otp/verify" -Body $t1Body
$t1Pass = ($t1.Status -eq 400 -and [string]$t1.Json.code -eq "DEVICE_FINGERPRINT_REQUIRED")
Add-Result -List $results -Name "Missing fingerprint" -Pass $t1Pass -Expected "400 + DEVICE_FINGERPRINT_REQUIRED" -Actual "$($t1.Status) + $([string]$t1.Json.code)"

# Test 2: first known device
$otp2 = Request-OtpWithRetry -RequestUrl "$BaseUrl/request-otp" -BasePayload $reqOtpBody
$t2Body = $verifyBaseBody.Clone()
$t2Body.otp = [string]$otp2.Json.devOtp
$t2Body.deviceFingerprint = $FingerprintA
$t2 = Invoke-JsonPost -Url "$BaseUrl/otp/verify" -Body $t2Body
$t2Pass = ($t2.Status -eq 200)
Add-Result -List $results -Name "First device login" -Pass $t2Pass -Expected "200" -Actual "$($t2.Status)"

# Test 3: same device again
$otp3 = Request-OtpWithRetry -RequestUrl "$BaseUrl/request-otp" -BasePayload $reqOtpBody
$t3Body = $verifyBaseBody.Clone()
$t3Body.otp = [string]$otp3.Json.devOtp
$t3Body.deviceFingerprint = $FingerprintA
$t3 = Invoke-JsonPost -Url "$BaseUrl/otp/verify" -Body $t3Body
$t3Pass = ($t3.Status -eq 200)
Add-Result -List $results -Name "Same device login again" -Pass $t3Pass -Expected "200" -Actual "$($t3.Status)"

# Test 4: new unknown device
$otp4 = Request-OtpWithRetry -RequestUrl "$BaseUrl/request-otp" -BasePayload $reqOtpBody
$t4Body = $verifyBaseBody.Clone()
$t4Body.otp = [string]$otp4.Json.devOtp
$t4Body.deviceFingerprint = $FingerprintB
$t4 = Invoke-JsonPost -Url "$BaseUrl/otp/verify" -Body $t4Body
$t4Pass = ($t4.Status -eq 403 -and [string]$t4.Json.code -eq "NEW_DEVICE_APPROVAL_REQUIRED" -and [string]$t4.Json.approvalStatus -eq "pending")
Add-Result -List $results -Name "New device approval flow" -Pass $t4Pass -Expected "403 + NEW_DEVICE_APPROVAL_REQUIRED + pending" -Actual "$($t4.Status) + $([string]$t4.Json.code) + $([string]$t4.Json.approvalStatus)"

Write-Host ""
$results | Format-Table -AutoSize
Write-Host ""

$failed = @($results | Where-Object { $_.Pass -eq "FAIL" }).Count
if ($failed -gt 0) {
  Write-Host "Some tests failed ($failed). See table above." -ForegroundColor Yellow
  exit 1
}

Write-Host "All 4 tests passed." -ForegroundColor Green
exit 0
