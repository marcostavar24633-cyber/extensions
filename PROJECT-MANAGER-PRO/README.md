# PROJECT MANAGER PRO — автообновление 1.10.0

Папка содержит опубликованные исходники расширения. Канал обновления читает:
`https://raw.githubusercontent.com/marcostavar24633-cyber/extensions/main/PROJECT-MANAGER-PRO/manifest.json`

Файлы расширения загружаются напрямую из этой папки в локальную постоянную папку:
`%LOCALAPPDATA%\\PROJECT-MANAGER-PRO`

## Публикация будущей версии
При выпуске новой версии:
1. Обновить поле `version` в `manifest.json`.
2. Заменить все семь файлов расширения этой папки: `manifest.json`, `sidepanel.html`, `sidepanel.js`, `background.js`, `service-worker.js`, `content.js`, `styles.css`.
3. Сохранить поле `key` в manifest неизменным.
4. Проверить, что manifest и все файлы доступны по raw.githubusercontent.com.

После однократной установки локального Native Messaging помощника кнопка «Обновить» скачивает обновление напрямую, без ZIP. Перед заменой файлов создаётся резервная копия.
