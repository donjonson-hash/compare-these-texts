# Локализация карточок Compare Two Texts — кандидат 0.37.9

Подготовлены **52 локали**: английский оригинал и 51 перевод, включая региональные варианты испанского, португальского и китайского. Это набор языка карточки Chrome Web Store: название, краткое и полное описание. Английские название и краткое описание сохранены из `release.json`.

**Статус:** материалы кандидата, не публикация и не подтверждение обновления в Store. Полная локализация интерфейса находится в работе: каталоги переводов всего редактора и справки ещё не завершены. Наличие 52 карточек не означает готовность всего интерфейса на 52 языках. В полных описаниях нет такого обещания. Перевод интерфейса не переводит содержимое пользовательских документов.

Используются 52 поддерживаемых Chrome кода локалей: общий `en` вместо отдельных `en_AU`, `en_GB` и `en_US`. Код расширения `no` соответствует норвежскому букмолу. Список покрывает локали карточек, а не 52 различных языковых семейства.

## Подготовка и проверка

- Названия и короткие описания: `localizations.json`.
- Полные описания: 52 отдельных UTF-8 файла в `descriptions/`.
- Сохранены прежние переводы 21 локали, исправлены устаревшие указания English-only; добавлены сведения о локальном шифровании черновиков и отдельных пилотах Word / Google Docs.
- Для 30 новых локалей подготовлены полные переводы функций, конфиденциальности и ограничений; английские шаблоны не используются вместо переводов.
- Ограничения: до 75 UTF-16 единиц в названии, до 132 в кратком описании. Строки метаданных не содержат скрытых управляющих символов.
- Проверка носителями всех 52 локалей **не проводилась**. Техническая проверка полноты и длины строк не заменяет редактуру носителем.
- Скриншоты и видео не переводились в рамках этой задачи. Поддержка 52 языков интерфейса должна проверяться отдельно до соответствующего заявления в карточке.

## Порядок загрузки

1. Используйте проверенный установочный ZIP именно того кандидата, который отправляете на рассмотрение. Этот набор текстов не является ZIP расширения.
2. Сверьте название и краткое описание с `localizations.json` и собранными `_locales/*/messages.json`.
3. В Store listing выберите язык и вставьте весь текст соответствующего TXT. Полное описание не подставляется автоматически из manifest и не входит в runtime ZIP.
4. Проверьте предпросмотр, переносы, длины и направление текста, особенно арабский, персидский и иврит.
5. Используйте скриншоты, соответствующие фактической версии интерфейса. Сохранение файлов в репозитории не публикует карточку; отправка на рассмотрение выполняется отдельно.

Отдельное расширение для каждого языка создавать не нужно. Для неподдерживаемого языка метаданных резервным является английский. Локализация карточки не создаёт публикацию в Firefox AMO; её материалы и проверка остаются отдельной задачей.

Исторические ключевые слова и результаты прежнего исследования — `CWS-LOCALIZATIONS.md` и `KEYWORDS.md`. Они не являются новым исследованием Semrush и не доказывают частотность поиска в CWS. Не заменяйте корректные формулировки повторением ключевых слов.

## Файлы

| Локаль | Название | Полное описание |
| --- | --- | --- |
| `am` | Compare Two Texts — ጽሑፎችን ያወዳድሩ እና ያርትዑ | [descriptions/am.txt](descriptions/am.txt) |
| `ar` | Compare Two Texts — مقارنة النصوص وتحريرها | [descriptions/ar.txt](descriptions/ar.txt) |
| `bg` | Compare Two Texts — Сравняване и редактиране на текст | [descriptions/bg.txt](descriptions/bg.txt) |
| `bn` | Compare Two Texts — লেখা তুলনা ও সম্পাদনা | [descriptions/bn.txt](descriptions/bn.txt) |
| `ca` | Compare Two Texts — Compara i edita textos | [descriptions/ca.txt](descriptions/ca.txt) |
| `cs` | Compare Two Texts — Porovnání a úpravy textů | [descriptions/cs.txt](descriptions/cs.txt) |
| `da` | Compare Two Texts — Sammenlign og rediger tekster | [descriptions/da.txt](descriptions/da.txt) |
| `de` | Compare Two Texts — Texte vergleichen und bearbeiten | [descriptions/de.txt](descriptions/de.txt) |
| `el` | Compare Two Texts — Σύγκριση και επεξεργασία κειμένων | [descriptions/el.txt](descriptions/el.txt) |
| `en` | Compare Two Texts — Diff Checker for Word, PDF & Excel | [descriptions/en.txt](descriptions/en.txt) |
| `es` | Compare Two Texts — Comparar textos y editar | [descriptions/es.txt](descriptions/es.txt) |
| `es_419` | Compare Two Texts — Comparar textos y editar | [descriptions/es_419.txt](descriptions/es_419.txt) |
| `et` | Compare Two Texts — Tekstide võrdlemine ja muutmine | [descriptions/et.txt](descriptions/et.txt) |
| `fa` | Compare Two Texts — مقایسه و ویرایش متن | [descriptions/fa.txt](descriptions/fa.txt) |
| `fi` | Compare Two Texts — Vertaa ja muokkaa tekstejä | [descriptions/fi.txt](descriptions/fi.txt) |
| `fil` | Compare Two Texts — Paghambingin at i-edit ang teksto | [descriptions/fil.txt](descriptions/fil.txt) |
| `fr` | Compare Two Texts — Comparateur de texte et éditeur | [descriptions/fr.txt](descriptions/fr.txt) |
| `gu` | Compare Two Texts — લખાણની સરખામણી અને સંપાદન | [descriptions/gu.txt](descriptions/gu.txt) |
| `he` | Compare Two Texts — השוואה ועריכה של טקסטים | [descriptions/he.txt](descriptions/he.txt) |
| `hi` | Compare Two Texts — पाठ की तुलना और संपादन | [descriptions/hi.txt](descriptions/hi.txt) |
| `hr` | Compare Two Texts — Usporedba i uređivanje tekstova | [descriptions/hr.txt](descriptions/hr.txt) |
| `hu` | Compare Two Texts — Szövegek összehasonlítása | [descriptions/hu.txt](descriptions/hu.txt) |
| `id` | Compare Two Texts — Bandingkan dan edit teks | [descriptions/id.txt](descriptions/id.txt) |
| `it` | Compare Two Texts — Confronta testi e modifica | [descriptions/it.txt](descriptions/it.txt) |
| `ja` | Compare Two Texts — テキスト比較・編集 | [descriptions/ja.txt](descriptions/ja.txt) |
| `kn` | Compare Two Texts — ಪಠ್ಯ ಹೋಲಿಕೆ ಮತ್ತು ಸಂಪಾದನೆ | [descriptions/kn.txt](descriptions/kn.txt) |
| `ko` | Compare Two Texts — 텍스트 비교 및 편집 | [descriptions/ko.txt](descriptions/ko.txt) |
| `lt` | Compare Two Texts — Tekstų palyginimas ir taisymas | [descriptions/lt.txt](descriptions/lt.txt) |
| `lv` | Compare Two Texts — Tekstu salīdzināšana un rediģēšana | [descriptions/lv.txt](descriptions/lv.txt) |
| `ml` | Compare Two Texts — എഴുത്ത് താരതമ്യവും തിരുത്തലും | [descriptions/ml.txt](descriptions/ml.txt) |
| `mr` | Compare Two Texts — मजकूर तुलना आणि संपादन | [descriptions/mr.txt](descriptions/mr.txt) |
| `ms` | Compare Two Texts — Banding dan sunting teks | [descriptions/ms.txt](descriptions/ms.txt) |
| `nl` | Compare Two Texts — Teksten vergelijken en bewerken | [descriptions/nl.txt](descriptions/nl.txt) |
| `no` | Compare Two Texts — Sammenlign og rediger tekster | [descriptions/no.txt](descriptions/no.txt) |
| `pl` | Compare Two Texts — Porównywanie i edycja tekstów | [descriptions/pl.txt](descriptions/pl.txt) |
| `pt_BR` | Compare Two Texts — Comparar textos e editar | [descriptions/pt_BR.txt](descriptions/pt_BR.txt) |
| `pt_PT` | Compare Two Texts — Comparar textos e editar | [descriptions/pt_PT.txt](descriptions/pt_PT.txt) |
| `ro` | Compare Two Texts — Compară și editează texte | [descriptions/ro.txt](descriptions/ro.txt) |
| `ru` | Compare Two Texts — Сравнение текстов и правка | [descriptions/ru.txt](descriptions/ru.txt) |
| `sk` | Compare Two Texts — Porovnávanie a úprava textov | [descriptions/sk.txt](descriptions/sk.txt) |
| `sl` | Compare Two Texts — Primerjava in urejanje besedil | [descriptions/sl.txt](descriptions/sl.txt) |
| `sr` | Compare Two Texts — Поређење и уређивање текстова | [descriptions/sr.txt](descriptions/sr.txt) |
| `sv` | Compare Two Texts — Jämför och redigera texter | [descriptions/sv.txt](descriptions/sv.txt) |
| `sw` | Compare Two Texts — Linganisha na hariri maandishi | [descriptions/sw.txt](descriptions/sw.txt) |
| `ta` | Compare Two Texts — உரை ஒப்பீடும் திருத்தமும் | [descriptions/ta.txt](descriptions/ta.txt) |
| `te` | Compare Two Texts — పాఠ్య పోలిక మరియు సవరణ | [descriptions/te.txt](descriptions/te.txt) |
| `th` | Compare Two Texts — เปรียบเทียบและแก้ไขข้อความ | [descriptions/th.txt](descriptions/th.txt) |
| `tr` | Compare Two Texts — Metin karşılaştırma ve düzenleme | [descriptions/tr.txt](descriptions/tr.txt) |
| `uk` | Compare Two Texts — Порівняння та редагування текстів | [descriptions/uk.txt](descriptions/uk.txt) |
| `vi` | Compare Two Texts — So sánh văn bản và chỉnh sửa | [descriptions/vi.txt](descriptions/vi.txt) |
| `zh_CN` | Compare Two Texts — 文本对比与编辑 | [descriptions/zh_CN.txt](descriptions/zh_CN.txt) |
| `zh_TW` | Compare Two Texts — 文字比較與編輯 | [descriptions/zh_TW.txt](descriptions/zh_TW.txt) |
