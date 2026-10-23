# Как добавить локализованные карточки Compare These Texts

Комплект 0.35.5 включает **22 локали**: английский и 21 перевод, в том числе
региональные варианты испанского и португальского. Сохранены ранее согласованные
названия, краткие и полные описания. Редактор, welcome page и встроенная справка
остаются английскими.

| Язык / вариант | Код | Полное описание |
| --- | --- | --- |
| English, резервный | `en` | `descriptions/en.txt` |
| Deutsch | `de` | `descriptions/de.txt` |
| Français | `fr` | `descriptions/fr.txt` |
| Español, España | `es` | `descriptions/es.txt` |
| Español, Latinoamérica | `es_419` | `descriptions/es_419.txt` |
| Italiano | `it` | `descriptions/it.txt` |
| Nederlands | `nl` | `descriptions/nl.txt` |
| Svenska | `sv` | `descriptions/sv.txt` |
| Dansk | `da` | `descriptions/da.txt` |
| Norsk bokmål | `no` | `descriptions/no.txt` |
| Suomi | `fi` | `descriptions/fi.txt` |
| العربية | `ar` | `descriptions/ar.txt` |
| Bahasa Indonesia | `id` | `descriptions/id.txt` |
| Русский | `ru` | `descriptions/ru.txt` |
| Português, Brasil | `pt_BR` | `descriptions/pt_BR.txt` |
| Português, Portugal | `pt_PT` | `descriptions/pt_PT.txt` |
| 日本語 | `ja` | `descriptions/ja.txt` |
| Filipino | `fil` | `descriptions/fil.txt` |
| Tiếng Việt | `vi` | `descriptions/vi.txt` |
| Türkçe | `tr` | `descriptions/tr.txt` |
| ไทย | `th` | `descriptions/th.txt` |
| 한국어 | `ko` | `descriptions/ko.txt` |

1. Распакуйте общий комплект. После проверки кандидата загрузите
   `ctt-chrome-0.35.5.zip` в соответствующую карточку Chrome Web Store.
2. Проверьте название и краткое описание. Сборка включает `_locales` и
   `default_locale: en`; исходные значения для сверки — в `localizations.json`.
3. В разделе Store listing выберите язык и вставьте полный текст из нужного
   TXT. Содержимое `descriptions/` не подставляется автоматически из manifest.
4. Добавьте подготовленные скриншоты и промоматериалы. Они показывают реальный
   английский интерфейс. Не отмечайте интерфейс как полностью переведённый.
5. Проверьте переносы строк и предпросмотр, особенно арабский текст справа
   налево. Сохраните изменения и отправьте на рассмотрение отдельным действием.

Отдельное расширение на каждый язык создавать не нужно. Изменение языка браузера
может изменить название расширения, но не язык его редактора и welcome page.
Для отсутствующей локали используется английский резервный вариант.

Firefox ZIP сохраняет английское название и описание. Этот комплект не
создаёт карточку AMO и не добавляет её переводы.

Таблица текстов, их длины и исторические данные местных ключевых слов —
`CWS-LOCALIZATIONS.md`. Лимиты проверяются сборкой: 75 UTF-16 единиц для имени
и 132 для краткого описания. Не заменяйте подготовленные строки массовым
машинным переводом без проверки фактических функций и ограничений.
