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
  $api = "https://api.github.com/repos/$repo/git/trees/$branch`?recursive=1"
  $tree = Invoke-RestMethod -Uri $api -Headers @{ 'User-Agent'='PROJECT-MANAGER-PRO-Updater'; 'Accept'='application/vnd.github+json' } -TimeoutSec 30
  $files = @($tree.tree | Where-Object { $_.type -eq 'blob' -and $_.path.StartsWith($prefix) -and $_.path.Substring($prefix.Length) -notmatch '/' })
  if ($files.Count -lt 2 -or -not ($files.path -contains ($prefix + 'manifest.json'))) { throw 'В GitHub не найдена опубликованная сборка расширения.' }
  $parent = Split-Path -Parent $target
  $stage = Join-Path $parent ('PROJECT-MANAGER-PRO-stage-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $stage -Force | Out-Null
  foreach ($file in $files) {
    $name = $file.path.Substring($prefix.Length)
    if ($name -match '[\\:]' -or $name -in @('INSTALL.bat','UPDATE.bat','INSTALL-UPDATE-HELPER.bat','NativeHost.cs','updater-host.ps1','README.md')) { continue }
    $url = "https://raw.githubusercontent.com/$repo/$branch/$($file.path)"
    $out = Join-Path $stage $name
    Invoke-WebRequest -Uri $url -OutFile $out -Headers @{ 'User-Agent'='PROJECT-MANAGER-PRO-Updater' } -TimeoutSec 30
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
    Remove-Item -LiteralPath $stage -Recurse -Force
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
