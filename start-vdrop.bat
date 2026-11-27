@echo off
setlocal
cd /d "%~dp0"

title vDrop
echo.
echo  vDrop — starting on http://0.0.0.0:1947 (all interfaces)
echo  Open http://localhost:1947 on this PC, or your Wi-Fi IP from other devices.
echo  Keep this window open while transferring files.
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js was not found. Install Node.js 20+ from https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo ERROR: npm install failed.
    pause
    exit /b 1
  )
)

echo Building vDrop...
call npm run build
if errorlevel 1 (
  echo.
  echo ERROR: build failed.
  pause
  exit /b 1
)

rem Allow LAN devices through Windows Firewall (Public Wi-Fi profiles)
netsh advfirewall firewall delete rule name="vDrop 1947" >nul 2>&1
netsh advfirewall firewall delete rule name="YDroply 1947" >nul 2>&1
netsh advfirewall firewall delete rule name="LanDrop 1947" >nul 2>&1
netsh advfirewall firewall delete rule name="LanDrop 1857" >nul 2>&1
netsh advfirewall firewall add rule name="vDrop 1947" dir=in action=allow protocol=TCP localport=1947 profile=any >nul 2>&1

rem Open the browser shortly after the server begins starting
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:1947"

call npm run start
echo.
echo vDrop stopped.
pause
