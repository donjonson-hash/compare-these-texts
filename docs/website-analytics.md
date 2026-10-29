# Website product events

Destination: GA4 `G-J33QPHR8L3`. The Google tag and event sink are injected by
`scripts/website_analytics.py` into website output after offline ZIP packaging.
The Chrome Web Store analytics property is separate and is not used here.

| Event | Trigger | Allowed parameters |
| --- | --- | --- |
| `comparison_complete` | A current, complete comparison has rendered | `comparison_type`: `text` or `table` |
| `document_download` | A prepared result has been handed to the browser download mechanism | `file_format`: `docx`, `pdf`, `txt`, `csv`, `tsv`, `xlsx`, `html`, `json`; `workspace`: `comparison` or `editor` |
| `chrome_store_click` | Click on this product's actual Chrome Web Store link | None |

The sink forwards only fixed vocabulary and explicitly routes events to the
website property. No filenames, text, errors, document identifiers, counts or
drafts are added. A missing or failing analytics sink cannot stop document work.
The offline extension packages have no analytics sink or remote Google script.

Comparisons needing clarification, cancelled/failed/stale comparisons, redraws
and restored sessions do not count as new completions. Applying comparison
settings successfully is a new completed comparison. Example comparisons also
count; these are activity counts, not proof of customer acquisition.

Downloads count initiation, not confirmed saving to disk. A PDF preview does
not count. The single-PDF automatic download and its manual fallback count once
per prepared version. Opening a PDF in a separate browser viewer cannot confirm
whether the user subsequently saves it. A store click does not confirm install.

After publication, complete a comparison, download a result and follow the
store link. Confirm the three event names in the website property's Realtime
report. Mark `document_download` as a key event if measuring completed product
use; keep `chrome_store_click` separate from the store-managed `install` event.
Parameter breakdowns in reports may require event-scoped custom dimensions.

## Acquisition links

The website config preserves only `utm_source`, `utm_medium`, `utm_campaign`
and `utm_content` in `page_location`. Values must be single, nonempty lowercase
ASCII slugs: a letter or digit followed by letters, digits, underscores or
hyphens, at most 64 characters total. Duplicate keys and other query parameters
are excluded, as are fragments. Never put user details, document names or text
in campaign labels. This format check is not a detector of personal information.
No campaign data is stored separately by the app. Do not tag internal navigation:
GA handles session attribution from the landing visit.

Launch campaign: `launch_2026_10`. Use the following links only at the named
placement; posting the same link everywhere would erase source distinctions.

| Placement | URL |
| --- | --- |
| YouTube video description: try online | https://comparetwotexts.pro/?utm_source=youtube&utm_medium=video&utm_campaign=launch_2026_10&utm_content=description |
| YouTube pinned comment | https://comparetwotexts.pro/?utm_source=youtube&utm_medium=video&utm_campaign=launch_2026_10&utm_content=pinned_comment |
| Telegram launch post | https://comparetwotexts.pro/?utm_source=telegram&utm_medium=social&utm_campaign=launch_2026_10&utm_content=launch_post |
| GitHub README | https://comparetwotexts.pro/?utm_source=github&utm_medium=referral&utm_campaign=launch_2026_10&utm_content=readme |
| YouTube description: add to Chrome | https://chromewebstore.google.com/detail/kclhfaiampafehfhhlejeeefhdhocfcg?utm_source=youtube&utm_medium=video&utm_campaign=launch_2026_10 |

The last link goes directly to the store. Its page views and installs belong to
the separate store-managed Analytics property, not the website funnel. Chrome
Web Store documents support for source, medium and campaign; do not rely on its
support for content tags. A website store click is still not an install.

After deployment, test a tagged landing in a fresh browser session with analytics
allowed, compare two sample texts and download a result. Realtime/DebugView can
confirm events; then check the website Traffic acquisition report with Session
source/medium or Session campaign and select the `document_download` key event.
Ordinary reports may take 24–48 hours to populate. A test visit is not customer
traction; exclude or identify test activity when interpreting launch results.
Event counts are actions, not unique people. Use session key-event rate when
comparing sources, with enough visits to avoid conclusions from a single test.

References:
- https://support.google.com/analytics/answer/10917952
- https://developer.chrome.com/docs/webstore/google-analytics
