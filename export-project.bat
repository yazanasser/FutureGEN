@echo off
setlocal
cd /d "%~dp0"

set "SRC=%~dp0"
:: Remove trailing backslash for robocopy
set "SRC_CLEAN=%SRC:~0,-1%"
set "OUTPUT=%SRC%FutureGEN-PRO-Export.zip"
set "TMPDIR=%TEMP%\FutureGEN-PRO-export-tmp"

echo ============================================
echo  FutureGEN PRO - Clean Project Export
echo ============================================
echo Excludes: node_modules, venv, __pycache__
echo          log files, .env files, ZIP archives
echo.

:: Clean up any leftover temp dir
if exist "%TMPDIR%" rmdir /s /q "%TMPDIR%"
mkdir "%TMPDIR%"

:: Copy project files, excluding unwanted dirs and files
robocopy "%SRC_CLEAN%" "%TMPDIR%" /E ^
  /XD node_modules venv __pycache__ ^
  /XF *.log *.err.log *.out.log .env .env.local storage_state.json FutureGEN-PRO-Export.zip ^
  /NJH /NJS /NFL /NDL

:: Create ZIP from the clean temp copy
if exist "%OUTPUT%" del "%OUTPUT%"
echo.
echo Creating ZIP archive...
powershell -NoProfile -Command "Compress-Archive -Path '%TMPDIR%\*' -DestinationPath '%OUTPUT%' -Force; Write-Host 'ZIP created successfully.'"

:: Clean up temp dir
rmdir /s /q "%TMPDIR%"

echo.
echo ============================================
echo  Export saved to:
echo  %OUTPUT%
echo ============================================
echo.
pause
endlocal
