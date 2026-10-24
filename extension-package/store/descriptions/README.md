# Полные описания Chrome Web Store

Тексты от 16 октября 2026, обновлённые 24 октября для версии CTT 0.37.1 и бренда Compare Two Texts: 19 выбранных языков, региональные варианты испанского и португальского и английский оригинал — 22 файла TXT.

## Как использовать

1. Загрузить собранный ZIP расширения в существующую карточку CTT. Этот набор описаний не является установочным архивом расширения.
2. Открыть Store listing в Chrome Web Store Developer Dashboard и выбрать язык.
3. Открыть соответствующий TXT в UTF-8 и скопировать весь текст в поле полного описания. Для русского — ru.txt, для японского — ja.txt и т. д.
4. Проверить переносы строк, соответствие названия и краткого описания из manifest, затем сохранить. Повторить для остальных локалей.
5. Проверить карточку и отправить обновление на рассмотрение отдельно. Подготовка файлов или слияние PR сами по себе ничего не публикуют.

Названия и краткие описания остаются в ../localizations.json. Эти полные описания хранятся отдельно, не входят в ZIP расширения и не подставляются автоматически через messages.json. Скриншоты и видео не локализованы в рамках этой задачи.

## Редакционные правила

- en.txt — исходный текст для проверки единого набора функций и ограничений. Название Compare Two Texts сохраняется во всех языках.
- Семантика переводов единая: сравнение и редактирование, таблицы, проверка сумм, печатные строки PDF, локальная обработка, поддерживаемые форматы и ограничения.
- Сравнение таблиц из двух файлов требует строки заголовков, отсутствия объединённых ячеек и значений вместо формул. Ограничение не приписывается всем операциям однодокументного редактора.
- Заполнение печатной строки в PDF не означает поддержку интерактивных PDF-форм или OCR.
- Интерфейс редактора пока английский. Подписи Edit & export, Amounts & percentages, Add text и Format сохранены на английском, чтобы пользователь мог найти элементы управления.
- Учитываются выбранные локальные ключевые фразы, без списков синонимов и обещаний роста позиций. Частотность Google не является частотностью поиска CWS.
- Входные файлы — до 2 MiB каждый. Тексты не обещают сохранение любого макета или сравнение изображений.

## Файлы и названия

| Локаль | Название | Полное описание |
|---|---|---|
| en | Compare Two Texts — Compare & Edit BETA | [en.txt](en.txt) |
| de | Compare Two Texts — Texte vergleichen und bearbeiten | [de.txt](de.txt) |
| fr | Compare Two Texts — Comparateur de texte et éditeur | [fr.txt](fr.txt) |
| es | Compare Two Texts — Comparar textos y editar | [es.txt](es.txt) |
| es_419 | Compare Two Texts — Comparar textos y editar | [es_419.txt](es_419.txt) |
| it | Compare Two Texts — Confronta testi e modifica | [it.txt](it.txt) |
| nl | Compare Two Texts — Teksten vergelijken en bewerken | [nl.txt](nl.txt) |
| sv | Compare Two Texts — Jämför och redigera texter | [sv.txt](sv.txt) |
| da | Compare Two Texts — Sammenlign og rediger tekster | [da.txt](da.txt) |
| no | Compare Two Texts — Sammenlign og rediger tekster | [no.txt](no.txt) |
| fi | Compare Two Texts — Vertaa ja muokkaa tekstejä | [fi.txt](fi.txt) |
| ar | Compare Two Texts — مقارنة النصوص وتحريرها | [ar.txt](ar.txt) |
| id | Compare Two Texts — Bandingkan dan edit teks | [id.txt](id.txt) |
| ru | Compare Two Texts — Сравнение текстов и правка | [ru.txt](ru.txt) |
| pt_BR | Compare Two Texts — Comparar textos e editar | [pt_BR.txt](pt_BR.txt) |
| pt_PT | Compare Two Texts — Comparar textos e editar | [pt_PT.txt](pt_PT.txt) |
| ja | Compare Two Texts — テキスト比較・編集 | [ja.txt](ja.txt) |
| fil | Compare Two Texts — Paghambingin at i-edit ang teksto | [fil.txt](fil.txt) |
| vi | Compare Two Texts — So sánh văn bản và chỉnh sửa | [vi.txt](vi.txt) |
| tr | Compare Two Texts — Metin karşılaştırma ve düzenleme | [tr.txt](tr.txt) |
| th | Compare Two Texts — เปรียบเทียบและแก้ไขข้อความ | [th.txt](th.txt) |
| ko | Compare Two Texts — 텍스트 비교 및 편집 | [ko.txt](ko.txt) |

Официальная инструкция: https://developer.chrome.com/docs/webstore/cws-dashboard-listing
