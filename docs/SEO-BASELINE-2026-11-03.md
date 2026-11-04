# Search baseline and copy changes — 3 November 2026

## Measurement

Read from the authenticated Search Console property `sc-domain:comparetwotexts.pro`.
The selected report range was three months, but the available chart covered
23–31 October 2026. Search type: Web; all countries and devices unless noted.

| Scope | Clicks | Impressions | Average position |
| --- | ---: | ---: | ---: |
| Property | 1 | 28 | 23.3 |
| United States, all devices | 0 | 5 | 19.0 |
| HTTPS home page, all countries | 0 | 14 | 23.7 |
| Extension page, all countries | 1 | 4 | 9.3 |
| PDF guide, all countries | 0 | 4 | 18.5 |
| Word guide, all countries | 0 | 3 | 64.3 |

The one click was from Sri Lanka; it may be an owner's check. Do not treat it
as proof of a new customer. Page impression totals need not sum to the
property total because more than one page may appear in a result set.

Visible query rows (all countries and devices):

| Query | Impressions | Average position |
| --- | ---: | ---: |
| text compare global | 2 | 4.5 |
| word compare documents | 2 | 95.5 |
| compare 2 texts | 1 | 18.0 |
| compare two files online text | 1 | 30.0 |
| two text compare | 1 | 47.0 |
| 2 text compare | 1 | 60.0 |
| matching text | 1 | 74.0 |

All visible query rows had zero clicks; the query table does not expose every
query represented in the property totals. These are averages over very few
impressions, not stable current rankings or search volumes.

Semrush campaign `31738077_5696259` tracks Google, US, English, desktop.
On 3 November, eight queries were added to the existing `compare texts` and
`diff text`: `compare two texts`, `compare text`, `text comparison tool`,
`compare text online`, `compare word documents`, `compare pdf files`,
`compare excel files`, `compare csv files`. The saved campaign has 10 keywords.
No first position measurement for the eight new queries was available yet.
The old two queries had no top-100 position in the available 2 November data.
Semrush `no_data` does not establish absence from Google's index or rankings.

## Copy decisions

- Keep the home title and H1, already aligned with `compare two texts`.
  Do not repeat numeric variants or add keyword lists to the interface.
- Make the home description explain pasting/uploading, reviewing, editing and
  downloading. Keep the WebPage JSON-LD description in sync; the build derives
  Open Graph metadata from the page metadata.
- Clarify online text comparison in the PDF title, description and how-to
  heading. Keep its URL, H1 and inbound links unchanged.
- Document the existing PDF import limits and add a troubleshooting FAQ.
  Source: `src/pdf-source.mjs` (2 MiB, 100 pages, usable text on every page,
  additional complexity limits, unsupported protection/forms/annotations).
- Keep `Compare documents` in the PDF steps: `src/navigation.js` selects that
  button label after a file is loaded.

## Follow-up measurement

Record the publication date separately from this baseline. After publication,
compare the same page/country/device filters over equal periods, allowing for
Search Console reporting delay and Google's recrawl. Track clicks and
impressions alongside average position; sparse initial data cannot establish
that a copy change caused movement. Google may choose a different snippet.
Do not repeatedly request indexing or change metadata on the strength of one
impression. No ranking increase is promised.
