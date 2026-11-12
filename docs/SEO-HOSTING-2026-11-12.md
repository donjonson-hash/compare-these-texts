# SEO delivery audit — 12 November 2026

## Confirmed production behavior

GET requests to https://comparetwotexts.pro confirmed:

| Request | Observed response | Desired behavior |
| --- | --- | --- |
| http://comparetwotexts.pro/ | 302 to HTTPS, then 200 | 301 or 308 to the same HTTPS URL |
| https://comparetwotexts.pro/compare-word-documents | 307 to the slash URL, then 200 | 301 or 308 to the slash URL |
| https://www.comparetwotexts.pro/ | 301 to the apex HTTPS URL | Preserve |
| HTTPS HTML and license responses | No Strict-Transport-Security header | max-age=31536000 on successful HTTPS responses |

The Word landing page canonical, sitemap entry and internal links already use
https://comparetwotexts.pro/compare-word-documents/. Its historical Search Console
redirect error (last crawl 9 November) did not reproduce during this audit.
A temporary redirect alone is not proof of that historical error.

## Application correction

The website-only minification pass now covers the shared CSS and classic scripts
loaded by the ten public HTML routes. It preserves JavaScript program structure,
classic globals and module boundaries. Extension archives are generated before
this pass and must remain byte-identical to the same source baseline.

## Hosting changes still required

The current Sites static manifest exposes a directory, not arbitrary HTTP
response headers or redirect rules. The existing src/_headers already declares
HSTS, but the production responses do not apply it. Adding another HSTS line or
client-side JavaScript would not fix the observed HTTP behavior.

The hosting provider should:

1. Change the HTTP-to-HTTPS redirect from temporary to permanent (301 or 308),
   retaining the original path and query string.
2. Permanently normalize known directory routes to their trailing-slash URL.
   Keep query strings and avoid rewriting asset filenames or introducing loops.
3. Send Strict-Transport-Security: max-age=31536000 on HTTPS responses. Do not
   enable includeSubDomains or preload as part of this change.
4. If explicit exclusion of license documents from search is desired, apply
   X-Robots-Tag: noindex to those exact license resources, leaving them publicly
   readable and crawlable. Do not canonicalize license text to the homepage.

Verify real GET responses after the hosting change; an uploaded configuration
file is not sufficient evidence. Check apex and www HTTPS responses, HTTP
redirects, all sitemap routes with and without a slash, and a representative
license. Then run Search Console live URL inspection and validation for the
Word URL, and a new Semrush crawl.

## Intentionally unchanged

- The five Google duplicate examples are standard license documents, not product
  landing pages. Preserve the licenses and their attribution links.
- The 13 single-link resources are licenses and downloadable ZIP/MD files.
- /word-addin/ intentionally carries noindex, nofollow. robots.txt allows crawling.
- llms.txt is not required by Google Search.
- The CSV gives no details explaining the privacy-page content assessment; do
  not change privacy claims merely to satisfy an unspecified SEO score.

References:
- https://developers.google.com/search/docs/crawling-indexing/301-redirects
- https://developers.google.com/search/docs/crawling-indexing/block-indexing
- https://www.semrush.com/kb/956-unminified-files
