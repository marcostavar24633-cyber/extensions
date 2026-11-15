$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repo = 'marcostavar24633-cyber/extensions'
$branch = 'main'
$target = Join-Path $env:LOCALAPPDATA 'PROJECT-MANAGER-PRO'
$backupRoot = Join-Path $env:LOCALAPPDATA 'PROJECT-MANAGER-PRO-Backups'
$work = Join-Path $env:TEMP ('PMPRO-ZIP-' + [guid]::NewGuid().ToString('N'))
$zip = Join-Path $work 'extensions-main.zip'
$extract = Join-Path $work 'extract'
$stage = Join-Path $work 'stage'

try {
  Write-Host 'PROJECT MANAGER PRO — обновление из ZIP-архива GitHub' -ForegroundColor Cyan
  Write-Host 'Скачиваем архив репозитория...'
  New-Item -ItemType Directory -Path $stage -Force | Out-Null
  $url = "https://codeload.github.com/$repo/zip/refs/heads/$branch"
  Invoke-WebRequest -UseBasicParsing -ErrorAction Stop -Uri $url -OutFile $zip -Headers @{ 'User-Agent'='PROJECT-MANAGER-PRO-ZIP-Updater' } -TimeoutSec 180

  Write-Host 'Распаковываем архив...'
  Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force
  $root = Get-ChildItem -LiteralPath $extract -Directory | Select-Object -First 1
  if (-not $root) { throw 'Архив пуст или имеет неизвестную структуру.' }
  $source = Join-Path $root.FullName 'PROJECT-MANAGER-PRO'
  $sourceManifest = Join-Path $source 'manifest.json'
  if (-not (Test-Path -LiteralPath $sourceManifest)) { throw 'В архиве не найдена папка PROJECT-MANAGER-PRO/manifest.json.' }

  $remoteManifest = Get-Content -Raw -LiteralPath $sourceManifest | ConvertFrom-Json
  if (-not $remoteManifest.version) { throw 'В manifest.json отсутствует номер версии.' }
  $localManifest = Join-Path $target 'manifest.json'
  if (Test-Path -LiteralPath $localManifest) {
    $installed = Get-Content -Raw -LiteralPath $localManifest | ConvertFrom-Json
    if ($installed.key -and $remoteManifest.key -and $installed.key -ne $remoteManifest.key) {
      throw 'Обновление отменено: ключ расширения отличается. Необходимо сохранить текущий ID расширения.'
    }
    Write-Host ("Установленная версия: " + $installed.version)
  } else {
    Write-Host 'Текущая установка не найдена — будет создана папка для обновления.'
  }
  Write-Host ("Версия в архиве: " + $remoteManifest.version)

  $allowed = @('manifest.json','sidepanel.html','sidepanel.js','background.js','service-worker.js','content.js','styles.css')
  foreach ($name in $allowed) {
    $from = Join-Path $source $name
    if (-not (Test-Path -LiteralPath $from)) { throw "В архиве отсутствует обязательный файл: $name" }
    Copy-Item -LiteralPath $from -Destination (Join-Path $stage $name) -Force
  }
  $staged = Get-Content -Raw -LiteralPath (Join-Path $stage 'manifest.json') | ConvertFrom-Json
  if ([string]$staged.version -ne [string]$remoteManifest.version) { throw 'Проверка manifest.json не пройдена.' }

  New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
  if (Test-Path -LiteralPath $target) {
    $backup = Join-Path $backupRoot ('backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    Copy-Item -LiteralPath $target -Destination $backup -Recurse -Force
    Write-Host ("Резервная копия: " + $backup)
  } else {
    New-Item -ItemType Directory -Path $target -Force | Out-Null
  }

  try {
    foreach ($name in $allowed) {
      Copy-Item -LiteralPath (Join-Path $stage $name) -Destination (Join-Path $target $name) -Force
    }
  } catch {
    if ($backup -and (Test-Path -LiteralPath $backup)) {
      Remove-Item -LiteralPath $target -Recurse -Force
      Copy-Item -LiteralPath $backup -Destination $target -Recurse -Force
    }
    throw
  }

  Write-Host ''
  Write-Host ("УСПЕШНО: PROJECT MANAGER PRO обновлён до версии " + $remoteManifest.version) -ForegroundColor Green
  Write-Host 'Откройте chrome://extensions/ и нажмите кнопку перезагрузки у PROJECT MANAGER PRO.'
  Write-Host 'Данные проектов и настройки хранятся в Chrome и не затрагиваются.'
} catch {
  Write-Host ''
  Write-Host ("ОШИБКА: " + $_.Exception.Message) -ForegroundColor Red
  Write-Host 'Файлы установленного расширения не должны считаться обновлёнными.'
  exit 1
} finally {
  if (Test-Path -LiteralPath $work) {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
  }
}
