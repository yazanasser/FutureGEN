@echo off
cd /d "%~dp0"
title FutureGen Server
echo.
echo  =========================================
echo   FutureGen AI Tools - Starting Server...
echo  =========================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] Node.js not found. Download from: https://nodejs.org
    pause
    exit /b 1
)

if not exist "node_modules\express" (
    echo  [INFO] Installing dependencies...
    npm install
    echo.
)

echo  [OK] Server starting on http://localhost:3000
echo  [OK] Browser will open in 4 seconds...
echo  [OK] Press Ctrl+C here to stop the server.
echo.

powershell -WindowStyle Hidden -Command "Start-Sleep 4; Start-Process 'http://localhost:3000'"

node server\app.js