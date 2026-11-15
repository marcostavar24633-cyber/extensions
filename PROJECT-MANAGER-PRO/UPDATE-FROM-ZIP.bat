@echo off
setlocal
title PROJECT MANAGER PRO - ZIP updater
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0UPDATE-FROM-ZIP.ps1"
if errorlevel 1 (
  echo.
  echo Update failed. Send a screenshot of this window.
  pause
  exit /b 1
)
echo.
pause
endlocal
