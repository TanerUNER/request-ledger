@echo off
setlocal
cd /d "%~dp0"

rem Request Ledger · stop the local server started by start.cmd.
rem Reads .rl-server.lock (pid + port), asks /__rl/shutdown, then falls back to
rem terminating the recorded pid if the server does not exit.

set "LOCK=%CD%\.rl-server.lock"

if not exist "%LOCK%" (
  echo Request Ledger is not running: no .rl-server.lock found.
  exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'SilentlyContinue'; $l = Get-Content -Raw '%LOCK%' | ConvertFrom-Json; try { Invoke-WebRequest -UseBasicParsing -Method Post -TimeoutSec 3 ('http://127.0.0.1:' + $l.port + '/__rl/shutdown') | Out-Null } catch {}; Start-Sleep -Milliseconds 600; $p = Get-Process -Id $l.pid -ErrorAction SilentlyContinue; if ($p) { Stop-Process -Id $l.pid -Force; Start-Sleep -Milliseconds 400 }; $left = Get-Process -Id $l.pid -ErrorAction SilentlyContinue; if (-not $left) { Remove-Item '%LOCK%' -Force; Write-Host 'Request Ledger local server stopped.'; exit 0 }; Write-Host 'Request Ledger local server is still running.'; exit 1"

if errorlevel 1 (
  echo Could not stop the local server. Check the .rl-server.lock file.
  exit /b 1
)

exit /b 0
