# Compatibility fix: use basic parsing for Windows PowerShell 5.1
# This avoids the Internet Explorer engine dependency in Invoke-WebRequest.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repo = 'marcostavar24633-cyber/extensions'
$branch = 'main'
$prefix = 'PROJECT-MANAGER-PRO/'
$target = Join-Path $env:LOCALAPPDATA 'PROJECT-MANAGER-PRO'
$backupRoot = Join-Path $env:LOCALAPPDATA 'PROJECT-MANAGER-PRO-Backups'
function Read-Exact([System.IO.Stream]$stream, [int]$count) {
  $buffer = New-Object byte[] $count; $offset = 0
  while ($offset -lt $count) { $n = $stream.Read($buffer, $offset, $count - $offset); if ($n -le 0) { throw 'Не удалось прочитать запрос обновления.' }; $offset += $n }
  return ,$buffer
}
function Send-Response($obj) {
  $json = ConvertTo-Json -InputObject $obj -Compress -Depth 8
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $stream = [Console]::OpenStandardOutput()
  $len = [BitConverter]::GetBytes([int]$bytes.Length)
  $stream.Write($len, 0, 4); $stream.Write($bytes, 0, $bytes.Length); $stream.Flush()
}
function Get-RemoteManifest {
  $url = "https://raw.githubusercontent.com/$repo/$branch/$prefix`manifest.json"
  return Invoke-RestMethod -Uri $url -Headers @{ 'User-Agent'='PROJECT-MANAGER-PRO-Updater'; 'Cache-Control'='no-cache' } -TimeoutSec 25
}
try {
  $stdin = [Console]::OpenStandardInput()
  $lengthBytes = Read-Exact $stdin 4
  $length = [BitConverter]::ToInt32($lengthBytes, 0)
  if ($length -lt 2 -or $length -gt 65536) { throw 'Некорректный размер запроса.' }
  $payload = [System.Text.Encoding]::UTF8.GetString((Read-Exact $stdin $length)) | ConvertFrom-Json
  if ($payload.action -notin @('check','update')) { throw 'Неизвестная команда помощника.' }
  $remote = Get-RemoteManifest
  $remoteVersion = [version]$remote.version
  $localVersion = [version]'0.0.0'
  $localManifest = Join-Path $target 'manifest.json'
  if (Test-Path $localManifest) { $localVersion = [version](Get-Content -Raw -LiteralPath $localManifest | ConvertFrom-Json).version }
  if ($remoteVersion -le $localVersion) {
    Send-Response @{ ok=$true; updated=$false; currentVersion=$localVersion.ToString(); latestVersion=$remoteVersion.ToString(); message="Установлена последняя версия $($localVersion.ToString())." }
    exit 0
  }
  if ($payload.action -eq 'check') {
    Send-Response @{ ok=$true; updated=$false; currentVersion=$localVersion.ToString(); latestVersion=$remoteVersion.ToString(); updateAvailable=$true; message="Доступна версия $($remoteVersion.ToString()). Нажмите «Обновить» ещё раз для установки." }
    exit 0
  }
  $parent = Split-Path -Parent $target
  $work = Join-Path $parent ('PROJECT-MANAGER-PRO-archive-' + [guid]::NewGuid().ToString('N'))
  $stage = Join-Path $work 'stage'
  $archive = Join-Path $work 'source.zip'
  New-Item -ItemType Directory -Path $stage -Force | Out-Null
  try {
    $archiveUrl = "https://codeload.github.com/$repo/zip/refs/heads/$branch"
    Invoke-WebRequest -UseBasicParsing -ErrorAction Stop -Uri $archiveUrl -OutFile $archive -Headers @{ 'User-Agent'='PROJECT-MANAGER-PRO-Updater' } -TimeoutSec 120
    Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $work 'extract') -Force
    $extractRoot = Join-Path $work 'extract'
    $projectFolder = Get-ChildItem -LiteralPath $extractRoot -Directory | Select-Object -First 1
    if (-not $projectFolder) { throw 'Архив GitHub пуст или имеет неизвестную структуру.' }
    $sourceFolder = Join-Path $projectFolder.FullName 'PROJECT-MANAGER-PRO'
    if (-not (Test-Path -LiteralPath (Join-Path $sourceFolder 'manifest.json'))) { throw 'В архиве GitHub не найдена папка PROJECT-MANAGER-PRO с manifest.json.' }
    Get-ChildItem -LiteralPath $sourceFolder -File -Force | ForEach-Object {
      $name = $_.Name
      if ($name -match '[\\:]' -or $name -in @('INSTALL.bat','UPDATE.bat','INSTALL-UPDATE-HELPER.bat','REPAIR-NATIVE-HOST.bat','REPAIR-NATIVE-HOST.ps1','NativeHost.cs','updater-host.ps1','README.md')) { return }
      Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $stage $name) -Force
    }
  } catch {
    if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
    throw
  }
  $stagedManifestPath = Join-Path $stage 'manifest.json'
  if (-not (Test-Path $stagedManifestPath)) { throw 'В новой сборке отсутствует manifest.json.' }
  $stagedManifest = Get-Content -Raw -LiteralPath $stagedManifestPath | ConvertFrom-Json
  if ([version]$stagedManifest.version -ne $remoteVersion) { throw 'Версия manifest.json не совпадает с опубликованной.' }
  if (Test-Path $localManifest) {
    $installedManifest = Get-Content -Raw -LiteralPath $localManifest | ConvertFrom-Json
    if ($installedManifest.key -and $stagedManifest.key -and $installedManifest.key -ne $stagedManifest.key) {
      throw 'Обновление отменено: ключ расширения изменился, Chrome создаст другой ID.'
    }
  }
  New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
  $backup = Join-Path $backupRoot ('backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  if (Test-Path $target) { Copy-Item -LiteralPath $target -Destination $backup -Recurse -Force }
  else { New-Item -ItemType Directory -Path $target -Force | Out-Null }
  try {
    Get-ChildItem -LiteralPath $stage -File -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $target -Force }
    Remove-Item -LiteralPath $work -Recurse -Force
  } catch {
    if (Test-Path $backup) {
      if (Test-Path $target) { Remove-Item -LiteralPath $target -Recurse -Force }
      Copy-Item -LiteralPath $backup -Destination $target -Recurse -Force
    }
    throw
  }
  Send-Response @{ ok=$true; updated=$true; version=$remoteVersion.ToString(); backup=$backup; message="Обновление до версии $($remoteVersion.ToString()) установлено. Перезапустите расширение." }
} catch {
  try { Send-Response @{ ok=$false; error=$_.Exception.Message } } catch {}
  exit 1
}
