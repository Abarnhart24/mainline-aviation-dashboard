@echo off
setlocal
echo ============================================================
echo   Goldberg's Springshot Dashboard — One-Time Setup
echo ============================================================
echo.

REM ── Find Python ─────────────────────────────────────────────────────────────
set PYTHON_EXE=
where python >nul 2>&1 && set PYTHON_EXE=python
if not defined PYTHON_EXE (
  where py >nul 2>&1 && set PYTHON_EXE=py
)

if not defined PYTHON_EXE (
  echo [setup] Python not found on this machine.
  echo [setup] Downloading Python 3.12 installer...
  echo.
  powershell -Command ^
    "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe' ^
     -OutFile '%TEMP%\python_installer.exe' -UseBasicParsing"
  if errorlevel 1 (
    echo [error] Download failed. Check your internet connection and try again.
    pause & exit /b 1
  )
  echo [setup] Installing Python 3.12 (this takes ~1 minute)...
  %TEMP%\python_installer.exe /quiet InstallAllUsers=0 PrependPath=1 Include_pip=1
  del "%TEMP%\python_installer.exe" >nul 2>&1
  echo.
  echo [setup] Python installed.  Please CLOSE this window, open a NEW one,
  echo         then run setup.bat again to finish installing packages.
  echo.
  pause
  exit /b 0
)

echo [setup] Python found: %PYTHON_EXE%
echo.

REM ── Install required packages ────────────────────────────────────────────────
echo [setup] Installing required packages (requests, pywin32, pycryptodome, azure-storage-blob)...
%PYTHON_EXE% -m pip install --quiet --upgrade requests pywin32 pycryptodome azure-storage-blob
if errorlevel 1 (
  echo [error] Package install failed. Check your internet connection.
  pause & exit /b 1
)
echo [setup] Packages installed successfully.
echo.

REM ── Register the daily Task Scheduler job ────────────────────────────────────
echo [setup] Registering daily 1 AM scheduled task...
powershell -ExecutionPolicy Bypass -File "%~dp0register_task.ps1"
if errorlevel 1 (
  echo [warning] Could not register scheduled task automatically.
  echo           You can still run refresh_now.bat manually at any time.
)
echo.
echo ============================================================
echo   Setup complete!
echo   - Dashboard refreshes automatically every day at 1:00 AM
echo   - Double-click refresh_now.bat for an immediate refresh
echo   - Logs are written to: automation\refresh.log
echo ============================================================
echo.
pause
endlocal
