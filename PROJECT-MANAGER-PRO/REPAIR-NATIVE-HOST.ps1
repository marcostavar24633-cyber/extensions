$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$helper = Join-Path $env:LOCALAPPDATA 'PROJECT-MANAGER-PRO-Updater'
$hostManifest = Join-Path $helper 'com.pmpro.updater.json'
$hostExe = Join-Path $helper 'updater-host.exe'
$hostScript = Join-Path $helper 'updater-host.ps1'
$registryPath = 'Software\Google\Chrome\NativeMessagingHosts\com.pmpro.updater'
$extensionId = 'kebojfipjbojngnhmphnbjcngmlicjma'

Write-Host ''
Write-Host 'PROJECT MANAGER PRO - repair Native Messaging' -ForegroundColor Cyan
Write-Host ''

$nativeSource = Join-Path $source 'NativeHost.cs'
$updaterSource = Join-Path $source 'updater-host.ps1'
if (-not (Test-Path -LiteralPath $nativeSource)) { throw "Не найден файл: $nativeSource" }
if (-not (Test-Path -LiteralPath $updaterSource)) { throw "Не найден файл: $updaterSource" }

New-Item -ItemType Directory -Path $helper -Force | Out-Null
Copy-Item -LiteralPath $nativeSource -Destination (Join-Path $helper 'NativeHost.cs') -Force
Copy-Item -LiteralPath $updaterSource -Destination $hostScript -Force

$cscCandidates = @(
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$csc = $cscCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $csc) { throw 'Не найден csc.exe. Требуется установленный .NET Framework 4.x.' }

& $csc /nologo /target:exe ("/out:" + $hostExe) (Join-Path $helper 'NativeHost.cs')
if ($LASTEXITCODE -ne 0) { throw "Компиляция NativeHost.cs завершилась с кодом $LASTEXITCODE" }
if (-not (Test-Path -LiteralPath $hostExe)) { throw 'После компиляции не найден updater-host.exe.' }

$manifestObject = @{
  name = 'com.pmpro.updater'
  description = 'PROJECT MANAGER PRO local updater'
  path = $hostExe
  type = 'stdio'
  allowed_origins = @("chrome-extension://$extensionId/")
}
$json = $manifestObject | ConvertTo-Json -Depth 5
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($hostManifest, $json, $utf8NoBom)

$key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($registryPath)
if (-not $key) { throw 'Не удалось создать ключ Native Messaging в HKCU.' }
try { $key.SetValue('', $hostManifest, [Microsoft.Win32.RegistryValueKind]::String) }
finally { $key.Close() }

$checkKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($registryPath)
if (-not $checkKey) { throw 'Ключ Native Messaging не найден после регистрации.' }
try { $registeredPath = [string]$checkKey.GetValue('') }
finally { $checkKey.Close() }

if ($registeredPath -ne $hostManifest) { throw "Путь в реестре не совпадает. Получено: $registeredPath" }
if (-not (Test-Path -LiteralPath $hostManifest)) { throw 'Native host manifest не создан.' }
if (-not (Test-Path -LiteralPath $hostExe)) { throw 'Native host EXE не создан.' }

Write-Host 'УСПЕШНО: локальный помощник собран и зарегистрирован.' -ForegroundColor Green
Write-Host "EXE: $hostExe"
Write-Host "Manifest: $hostManifest"
Write-Host "Registry: HKCU:\$registryPath"
Write-Host ''
Write-Host 'Теперь полностью закройте Chrome и откройте его снова.'
exit 0
