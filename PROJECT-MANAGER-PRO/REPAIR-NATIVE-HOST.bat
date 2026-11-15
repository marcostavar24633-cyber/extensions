@echo off
setlocal
title PROJECT MANAGER PRO - Native Host Repair
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0REPAIR-NATIVE-HOST.ps1"
if errorlevel 1 (
  echo.
  echo Repair failed. Copy the error text above.
  pause
  exit /b 1
)
echo.
pause
endlocal
