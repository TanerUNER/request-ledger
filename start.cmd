@echo off
setlocal
cd /d "%~dp0"

rem Request Ledger · start the local server without a console window.
rem The server writes .rl-server.lock with its pid and port after listening.
rem stop.cmd reads that lock and asks the server to shut down.
rem .rl-port keeps the last port; without it the launcher asks for a free port.

set "LOCK=%CD%\.rl-server.lock"
set "PORTFILE=%CD%\.rl-port"
set "PORT=0"
if exist "%PORTFILE%" set /p PORT=<"%PORTFILE%"
if "%PORT%"=="" set "PORT=0"
echo %PORT%| findstr /r "^[0-9][0-9]*$" >nul
if errorlevel 1 set "PORT=0"
if %PORT% GTR 65535 set "PORT=0"
set "PIDFILE=%TEMP%\rl-server-pid.txt"
set "OUTFILE=%TEMP%\rl-server-out.log"
set "ERRFILE=%TEMP%\rl-server-err.log"

if exist "%LOCK%" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $l = Get-Content -Raw '%LOCK%' | ConvertFrom-Json; $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 ('http://127.0.0.1:' + $l.port + '/__rl/status'); if ($r.StatusCode -eq 200) { Start-Process $l.url; exit 0 } } catch {}; exit 1"
  if not errorlevel 1 (
    echo Request Ledger is already running. Opening it in the browser.
    exit /b 0
  )
  del "%LOCK%" >nul 2>&1
)

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found on PATH. Install Node.js 18 or newer, then run start.cmd again.
  exit /b 1
)

if not exist "scripts\serve.cjs" (
  echo scripts\serve.cjs was not found next to start.cmd.
  exit /b 1
)

del "%PIDFILE%" >nul 2>&1
del "%OUTFILE%" >nul 2>&1
del "%ERRFILE%" >nul 2>&1

powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$ErrorActionPreference = 'SilentlyContinue'; $p = Start-Process -FilePath 'node' -ArgumentList @('scripts/serve.cjs','--port','%PORT%','--fallback-port-0','--open','--auto-stop=300','--lock','.rl-server.lock') -WorkingDirectory '%CD%' -WindowStyle Hidden -PassThru -RedirectStandardOutput '%OUTFILE%' -RedirectStandardError '%ERRFILE%'; $p.Id | Out-File -Encoding ascii '%PIDFILE%'"

set /a TRIES=0
:waitlock
if exist "%LOCK%" goto ready
set /a TRIES+=1
if %TRIES% GEQ 15 goto failed
ping -n 2 127.0.0.1 >nul
goto waitlock

:failed
echo Request Ledger could not start the local server.
if exist "%ERRFILE%" type "%ERRFILE%"
if exist "%OUTFILE%" type "%OUTFILE%"
exit /b 1

:ready
powershell -NoProfile -ExecutionPolicy Bypass -Command "$l = Get-Content -Raw '%LOCK%' | ConvertFrom-Json; $req = '%PORT%'; $act = [string]$l.port; if ($req -ne '0' -and $act -ne $req) { Write-Host ('Warning: port ' + $req + ' is in use; started on ' + $act + ' instead.') -ForegroundColor Yellow }; Write-Host ('Request Ledger is running at ' + $l.url)"
del "%PIDFILE%" >nul 2>&1
exit /b 0
