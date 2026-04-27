param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [switch]$Debug
)

$ErrorActionPreference = "Stop"

$repoPath = (Resolve-Path $ProjectRoot).Path
$functionsPath = Join-Path $repoPath "functions"
$firebaseJsonPath = Join-Path $repoPath "firebase.json"
$functionsPackageJsonPath = Join-Path $functionsPath "package.json"

if (-not (Test-Path $firebaseJsonPath)) { throw "firebase.json not found at: $firebaseJsonPath" }
if (-not (Test-Path $functionsPackageJsonPath)) { throw "functions/package.json not found at: $functionsPackageJsonPath" }

Push-Location $functionsPath
try { npm install } finally { Pop-Location }

Push-Location $repoPath
try {
  $deployArgs = @("deploy","--only","functions")
  if ($Debug.IsPresent) { $deployArgs += "--debug" }
  firebase @deployArgs
}
finally { Pop-Location }
