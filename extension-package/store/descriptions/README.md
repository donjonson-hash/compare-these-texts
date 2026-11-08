# Полные описания Chrome Web Store

Подготовлены для кандидата Compare Two Texts 0.37.9: **52 UTF-8 файла**, английский и 51 перевод. Для интерфейса определён список из 52 локалей; обычная сборка строго проверяет полноту его каталогов перед выпуском. Подготовка файлов не означает публикацию кандидата или прохождение браузерных проверок: результаты фиксируются отдельно.


Переводы включают тексты карточек, подготовленные ИИ, и машинный перевод строк интерфейса с выборочной проверкой ИИ. Внешний перевод разрешён владельцем для проектных подписей, сообщений и справки на этапе подготовки; пользовательские документы не отправляются и не переводятся. Проверка структуры и полноты не гарантирует естественность перевода.


## Как использовать

1. После проверки кандидата загрузить его установочный ZIP в существующую карточку CTT. Набор описаний не является установочным архивом.
2. В Chrome Web Store Developer Dashboard открыть Store listing и выбрать язык.
3. Вставить весь текст соответствующего TXT в поле полного описания.
4. Сверить название и краткое описание с `../localizations.json`, проверить переносы и предпросмотр для каждого языка.
5. Отправить обновление на рассмотрение отдельным действием. Файлы и слияние PR сами по себе ничего не публикуют.

Полные описания хранятся отдельно, не входят в runtime ZIP и не подставляются автоматически через messages.json. Скриншоты и видео здесь не локализованы.

## Редакционные правила и ограничения

- `en.txt` — ориентир для единого набора функций и ограничений. Бренд Compare Two Texts сохраняется во всех языках.
- Существующие переводы сохранены; новые тексты описывают сравнение и редактирование, таблицы, суммы и проценты, печатные пустые места PDF, DOCX → PDF, локальную обработку и ограничения.
- Документы для основного сценария расширения не загружаются на сервер. Шифрование черновиков AES-GCM-256 с ключом в профиле браузера не является защитой паролем; скачанные файлы не зашифрованы. Черновики истекают после семи дней без использования, веб и расширение сохраняют их отдельно.
- Пилоты Word и Google Docs устанавливаются отдельно и имеют свои условия конфиденциальности. Не заявляется автоматическая установка или публикация этих пилотов в магазинах Office.
- PDF требует текстовый слой. Нет OCR, поддержки интерактивных PDF-форм и PDF-комментариев; изображения и форматирование не сравниваются. Максимум 2 MiB на входной файл.
- Сложный макет может экспортироваться только как текст. Нет обещания точного воспроизведения любого Word-макета. DOCX-сноски, концевые сноски и комментарии не импортируются.
- Для двухфайлового сравнения таблиц нужны один ряд заголовков, отсутствие объединённых ячеек и значения вместо формул.
- Перевод интерфейса и карточки не переводит документы. Английские подписи функций в существующих описаниях могут оставаться как справочные названия элементов. PDF-отчёт может использовать английские подписи, если встроенный шрифт или обработка письма не поддерживает выбранный язык; об этом сообщается перед экспортом. Авторитетный текст программной лицензии остаётся английским.
- Проверка носителями всех 52 локалей не проводилась. Техническая проверка не заменяет редактуру носителями.
- Ключевые фразы используются естественно. Нет списков синонимов, обещаний роста позиций или подмены частотности CWS частотностью Google.

## Файлы и названия

| Локаль | Название | Полное описание |
| --- | --- | --- |
| `am` | Compare Two Texts — ጽሑፎችን ያወዳድሩ እና ያርትዑ | [am.txt](am.txt) |
| `ar` | Compare Two Texts — مقارنة النصوص وتحريرها | [ar.txt](ar.txt) |
| `bg` | Compare Two Texts — Сравняване и редактиране на текст | [bg.txt](bg.txt) |
| `bn` | Compare Two Texts — লেখা তুলনা ও সম্পাদনা | [bn.txt](bn.txt) |
| `ca` | Compare Two Texts — Compara i edita textos | [ca.txt](ca.txt) |
| `cs` | Compare Two Texts — Porovnání a úpravy textů | [cs.txt](cs.txt) |
| `da` | Compare Two Texts — Sammenlign og rediger tekster | [da.txt](da.txt) |
| `de` | Compare Two Texts — Texte vergleichen und bearbeiten | [de.txt](de.txt) |
| `el` | Compare Two Texts — Σύγκριση και επεξεργασία κειμένων | [el.txt](el.txt) |
| `en` | Compare Two Texts — Diff Checker for Word, PDF & Excel | [en.txt](en.txt) |
| `es` | Compare Two Texts — Comparar textos y editar | [es.txt](es.txt) |
| `es_419` | Compare Two Texts — Comparar textos y editar | [es_419.txt](es_419.txt) |
| `et` | Compare Two Texts — Tekstide võrdlemine ja muutmine | [et.txt](et.txt) |
| `fa` | Compare Two Texts — مقایسه و ویرایش متن | [fa.txt](fa.txt) |
| `fi` | Compare Two Texts — Vertaa ja muokkaa tekstejä | [fi.txt](fi.txt) |
| `fil` | Compare Two Texts — Paghambingin at i-edit ang teksto | [fil.txt](fil.txt) |
| `fr` | Compare Two Texts — Comparateur de texte et éditeur | [fr.txt](fr.txt) |
| `gu` | Compare Two Texts — લખાણની સરખામણી અને સંપાદન | [gu.txt](gu.txt) |
| `he` | Compare Two Texts — השוואה ועריכה של טקסטים | [he.txt](he.txt) |
| `hi` | Compare Two Texts — पाठ की तुलना और संपादन | [hi.txt](hi.txt) |
| `hr` | Compare Two Texts — Usporedba i uređivanje tekstova | [hr.txt](hr.txt) |
| `hu` | Compare Two Texts — Szövegek összehasonlítása | [hu.txt](hu.txt) |
| `id` | Compare Two Texts — Bandingkan dan edit teks | [id.txt](id.txt) |
| `it` | Compare Two Texts — Confronta testi e modifica | [it.txt](it.txt) |
| `ja` | Compare Two Texts — テキスト比較・編集 | [ja.txt](ja.txt) |
| `kn` | Compare Two Texts — ಪಠ್ಯ ಹೋಲಿಕೆ ಮತ್ತು ಸಂಪಾದನೆ | [kn.txt](kn.txt) |
| `ko` | Compare Two Texts — 텍스트 비교 및 편집 | [ko.txt](ko.txt) |
| `lt` | Compare Two Texts — Tekstų palyginimas ir taisymas | [lt.txt](lt.txt) |
| `lv` | Compare Two Texts — Tekstu salīdzināšana un rediģēšana | [lv.txt](lv.txt) |
| `ml` | Compare Two Texts — എഴുത്ത് താരതമ്യവും തിരുത്തലും | [ml.txt](ml.txt) |
| `mr` | Compare Two Texts — मजकूर तुलना आणि संपादन | [mr.txt](mr.txt) |
| `ms` | Compare Two Texts — Banding dan sunting teks | [ms.txt](ms.txt) |
| `nl` | Compare Two Texts — Teksten vergelijken en bewerken | [nl.txt](nl.txt) |
| `no` | Compare Two Texts — Sammenlign og rediger tekster | [no.txt](no.txt) |
| `pl` | Compare Two Texts — Porównywanie i edycja tekstów | [pl.txt](pl.txt) |
| `pt_BR` | Compare Two Texts — Comparar textos e editar | [pt_BR.txt](pt_BR.txt) |
| `pt_PT` | Compare Two Texts — Comparar textos e editar | [pt_PT.txt](pt_PT.txt) |
| `ro` | Compare Two Texts — Compară și editează texte | [ro.txt](ro.txt) |
| `ru` | Compare Two Texts — Сравнение текстов и правка | [ru.txt](ru.txt) |
| `sk` | Compare Two Texts — Porovnávanie a úprava textov | [sk.txt](sk.txt) |
| `sl` | Compare Two Texts — Primerjava in urejanje besedil | [sl.txt](sl.txt) |
| `sr` | Compare Two Texts — Поређење и уређивање текстова | [sr.txt](sr.txt) |
| `sv` | Compare Two Texts — Jämför och redigera texter | [sv.txt](sv.txt) |
| `sw` | Compare Two Texts — Linganisha na hariri maandishi | [sw.txt](sw.txt) |
| `ta` | Compare Two Texts — உரை ஒப்பீடும் திருத்தமும் | [ta.txt](ta.txt) |
| `te` | Compare Two Texts — పాఠ్య పోలిక మరియు సవరణ | [te.txt](te.txt) |
| `th` | Compare Two Texts — เปรียบเทียบและแก้ไขข้อความ | [th.txt](th.txt) |
| `tr` | Compare Two Texts — Metin karşılaştırma ve düzenleme | [tr.txt](tr.txt) |
| `uk` | Compare Two Texts — Порівняння та редагування текстів | [uk.txt](uk.txt) |
| `vi` | Compare Two Texts — So sánh văn bản và chỉnh sửa | [vi.txt](vi.txt) |
| `zh_CN` | Compare Two Texts — 文本对比与编辑 | [zh_CN.txt](zh_CN.txt) |
| `zh_TW` | Compare Two Texts — 文字比較與編輯 | [zh_TW.txt](zh_TW.txt) |

Официальная инструкция: https://developer.chrome.com/docs/webstore/cws-dashboard-listing
