@echo off
chcp 65001 >nul
setlocal
title PROJECT MANAGER PRO — установка автообновления
set "SOURCE=%~dp0"
set "TARGET=%LOCALAPPDATA%\PROJECT-MANAGER-PRO"
set "HELPER=%LOCALAPPDATA%\PROJECT-MANAGER-PRO-Updater"
set "HOSTMANIFEST=%HELPER%\com.pmpro.updater.json"
echo.
echo PROJECT MANAGER PRO 1.10.0 — установка обновления одной кнопкой
echo.
if not exist "%SOURCE%manifest.json" (
 echo ОШИБКА: manifest.json не найден. Запустите BAT из папки PROJECT-MANAGER-PRO.
 pause
 exit /b 1
)
if not exist "%SOURCE%updater-host.ps1" (
 echo ОШИБКА: updater-host.ps1 не найден рядом с установщиком.
 pause
 exit /b 1
)
if not exist "%TARGET%" mkdir "%TARGET%"
if not exist "%HELPER%" mkdir "%HELPER%"
echo Копирование файлов расширения...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$src=$env:SOURCE; $dst=$env:TARGET; Get-ChildItem -LiteralPath $src -File | Where-Object { $_.Name -in @('manifest.json','sidepanel.html','sidepanel.js','background.js','service-worker.js','content.js','styles.css') } | Copy-Item -Destination $dst -Force"
if errorlevel 1 (echo Ошибка копирования файлов расширения.& pause & exit /b 1)
echo Установка локального помощника...
copy /y "%SOURCE%updater-host.ps1" "%HELPER%\updater-host.ps1" >nul
copy /y "%SOURCE%NativeHost.cs" "%HELPER%\NativeHost.cs" >nul
set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%CSC%" (
 echo Не найден компилятор .NET Framework csc.exe.
 echo Установите .NET Framework 4.8 и повторите запуск.
 pause
 exit /b 1
)
"%CSC%" /nologo /target:exe /out:"%HELPER%\updater-host.exe" "%HELPER%\NativeHost.cs"
if errorlevel 1 (echo Не удалось собрать локальный помощник.& pause & exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$m=@{name='com.pmpro.updater';description='PROJECT MANAGER PRO local updater';path=(Join-Path $env:LOCALAPPDATA 'PROJECT-MANAGER-PRO-Updater\updater-host.exe');type='stdio';allowed_origins=@('chrome-extension://kebojfipjbojngnhmphnbjcngmlicjma/')}; [IO.File]::WriteAllText($env:HOSTMANIFEST, ($m | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))"
if errorlevel 1 (echo Не удалось создать Native Messaging manifest.& pause & exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$key='HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.pmpro.updater'; New-Item -Path $key -Force | Out-Null; Set-Item -Path $key -Value $env:HOSTMANIFEST"
if errorlevel 1 (echo Не удалось зарегистрировать помощник в Chrome.& pause & exit /b 1)
echo.
echo ГОТОВО: локальный помощник установлен.
echo Папка расширения: %TARGET%
echo.
echo Откроется страница расширений Chrome.
echo Если старая карточка PM PRO загружена из другой папки, удалите её.
echo Затем включите режим разработчика и выберите "Загрузить распакованное".
echo Укажите папку: %TARGET%
echo После первой установки обновления будут ставиться кнопкой "Обновить".
start "" "chrome://extensions/"
pause
endlocal
