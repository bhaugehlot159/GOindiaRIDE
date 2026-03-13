@echo off
setlocal EnableExtensions EnableDelayedExpansion

title GOindiaRIDE Restore Utility

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

call :find_latest "GOindiaRIDE_backup_full_*.zip" ZIP_PATH
call :find_latest "GOindiaRIDE_git_*.bundle" BUNDLE_PATH

echo.
echo ================= GOindiaRIDE Restore Utility =================
if defined ZIP_PATH (
  echo Latest ZIP    : "%ZIP_PATH%"
) else (
  echo Latest ZIP    : Not found
)
if defined BUNDLE_PATH (
  echo Latest BUNDLE : "%BUNDLE_PATH%"
) else (
  echo Latest BUNDLE : Not found
)
echo.
echo 1^) Restore files from ZIP  ^(recommended^)
echo 2^) Restore Git repo from BUNDLE
echo 3^) Exit
echo.
set /p "CHOICE=Select option [1-3]: "

if "%CHOICE%"=="1" goto RESTORE_ZIP
if "%CHOICE%"=="2" goto RESTORE_BUNDLE
goto __DONE__

:RESTORE_ZIP
if not defined ZIP_PATH (
  echo.
  echo ERROR: No backup ZIP found.
  goto __DONE__
)

for /f %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%T"
set "DEFAULT_TARGET=%USERPROFILE%\Desktop\GOindiaRIDE_restored_%STAMP%"
echo.
set /p "TARGET=Restore folder path [%DEFAULT_TARGET%]: "
if not defined TARGET set "TARGET=%DEFAULT_TARGET%"

if exist "%TARGET%" (
  echo.
  echo ERROR: Target already exists: "%TARGET%"
  goto __DONE__
)

mkdir "%TARGET%" 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: Unable to create target folder.
  goto __DONE__
)

echo.
echo Restoring ZIP backup...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%ZIP_PATH%' -DestinationPath '%TARGET%' -Force"
if errorlevel 1 (
  echo.
  echo ERROR: ZIP restore failed.
  goto __DONE__
)

echo.
echo ZIP restore complete: "%TARGET%"
start "" "%TARGET%"
goto __DONE__

:RESTORE_BUNDLE
if not defined BUNDLE_PATH (
  echo.
  echo ERROR: No Git bundle found.
  goto __DONE__
)

where git >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: git is not installed or not in PATH.
  goto __DONE__
)

for /f %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%T"
set "DEFAULT_TARGET=%USERPROFILE%\Desktop\GOindiaRIDE_gitrestore_%STAMP%"
echo.
set /p "TARGET=Restore folder path [%DEFAULT_TARGET%]: "
if not defined TARGET set "TARGET=%DEFAULT_TARGET%"

if exist "%TARGET%" (
  echo.
  echo ERROR: Target already exists: "%TARGET%"
  goto __DONE__
)

echo.
echo Cloning from bundle...
git clone --no-checkout "%BUNDLE_PATH%" "%TARGET%"
if errorlevel 1 (
  echo.
  echo ERROR: Bundle clone failed.
  goto __DONE__
)

echo.
echo Checking out main branch...
git -C "%TARGET%" checkout -f main
if errorlevel 1 (
  echo Main checkout failed. Trying fallback checkout...
  git -C "%TARGET%" checkout -f -B main refs/remotes/origin/main
  if errorlevel 1 (
    echo.
    echo WARNING: Repository restored but checkout is incomplete.
    echo You can run manually:
    echo   git -C "%TARGET%" checkout -f main
    goto __DONE__
  )
)

for /f %%H in ('git -C "%TARGET%" rev-parse --short HEAD') do set "HEAD_SHORT=%%H"
echo.
echo Bundle restore complete: "%TARGET%"
echo Current commit: %HEAD_SHORT%
start "" "%TARGET%"
goto __DONE__

:find_latest
set "%~2="
for %%D in ("%SCRIPT_DIR%" "D:\GOindiaRIDE_Backups" "%USERPROFILE%\OneDrive\GOindiaRIDE_Backups") do (
  if not defined %~2 (
    for /f "delims=" %%F in ('dir /b /a:-d /o:-d "%%~fD\%~1" 2^>nul') do (
      if not defined %~2 set "%~2=%%~fD\%%F"
    )
  )
)
goto :eof

:__DONE__
echo.
echo Done.
endlocal
