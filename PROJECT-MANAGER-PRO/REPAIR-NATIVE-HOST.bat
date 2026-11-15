@echo off
chcp 65001 >nul
setlocal
title PROJECT MANAGER PRO — восстановление Native Messaging

set "SOURCE=%~dp0"
set "HELPER=%LOCALAPPDATA%\PROJECT-MANAGER-PRO-Updater"
set "HOSTMANIFEST=%HELPER%\com.pmpro.updater.json"
set "HOSTEXE=%HELPER%\updater-host.exe"
set "HOSTPS=%HELPER%\updater-host.ps1"
set "REGKEY=Software\Google\Chrome\NativeMessagingHosts\com.pmpro.updater"

echo.
echo PROJECT MANAGER PRO — восстановление локального помощника
echo.

if not exist "%SOURCE%NativeHost.cs" (
  echo ОШИБКА: рядом с BAT не найден NativeHost.cs.
  echo Запустите этот файл из папки PROJECT-MANAGER-PRO.
  pause
  exit /b 1
)
if not exist "%SOURCE%updater-host.ps1" (
  echo ОШИБКА: рядом с BAT не найден updater-host.ps1.
  pause
  exit /b 1
)

if not exist "%HELPER%" mkdir "%HELPER%"
copy /y "%SOURCE%NativeHost.cs" "%HELPER%\NativeHost.cs" >nul
copy /y "%SOURCE%updater-host.ps1" "%HOSTPS%" >nul
if errorlevel 1 (
  echo ОШИБКА: не удалось скопировать файлы помощника.
  pause
  exit /b 1
)

set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%CSC%" (
  echo ОШИБКА: не найден csc.exe из .NET Framework.
  echo Установите .NET Framework 4.8 и повторите запуск.
  pause
  exit /b 1
)

"%CSC%" /nologo /target:exe /out:"%HOSTEXE%" "%HELPER%\NativeHost.cs"
if errorlevel 1 (
  echo ОШИБКА: не удалось собрать Native Messaging Host.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $m=@{name='com.pmpro.updater';description='PROJECT MANAGER PRO local updater';path=$env:HOSTEXE;type='stdio';allowed_origins=@('chrome-extension://kebojfipjbojngnhmphnbjcngmlicjma/')}; [IO.File]::WriteAllText($env:HOSTMANIFEST,($m|ConvertTo-Json -Depth 5),(New-Object System.Text.UTF8Encoding($false))); $k=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($env:REGKEY); $k.SetValue('', $env:HOSTMANIFEST, [Microsoft.Win32.RegistryValueKind]::String); $k.Close(); if (-not (Test-Path $env:HOSTEXE)) { throw 'EXE не найден' }; if (-not (Test-Path $env:HOSTMANIFEST)) { throw 'Native host manifest не найден' }; $reg=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($env:REGKEY); $v=$reg.GetValue(''); $reg.Close(); if ($v -ne $env:HOSTMANIFEST) { throw 'Путь в реестре не совпадает с путём manifest' }; Write-Host 'Native Messaging Host зарегистрирован:' $v"
if errorlevel 1 (
  echo.
  echo ОШИБКА регистрации. Скопируйте текст ошибки выше.
  pause
  exit /b 1
)

echo.
echo ГОТОВО. Помощник собран и зарегистрирован для текущего пользователя.
echo Теперь перезапустите Chrome и нажмите «Обновить» в PROJECT MANAGER PRO.
echo.
pause
endlocal
