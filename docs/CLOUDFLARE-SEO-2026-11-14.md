# Compare Two Texts: remaining Cloudflare settings

Verified on 14 November 2026. The site is served by Sites behind the user's
Cloudflare zone. Sites does not apply `src/_headers`. These are dashboard
settings to apply, not a claim that this Git commit changes edge behavior.

## Permanent directory redirects

In the `comparetwotexts.pro` zone, open Rules → Redirect Rules → Create rule
(Single Redirect). Select Custom filter expression and name it
`CTT canonical directory URLs`. Use:

```text
(http.host in {"comparetwotexts.pro" "www.comparetwotexts.pro"} and http.request.uri.path in {"/extension" "/privacy" "/support" "/terms" "/pricing" "/office-addins" "/compare-word-documents" "/compare-pdf-files" "/compare-excel-files" "/compare-csv-files"})
```

URL redirect: **Dynamic**. Target expression:

```text
concat("https://comparetwotexts.pro", http.request.uri.path, "/")
```

Status: **301**. **Preserve query string: enabled**. Place this rule before
the general www-to-apex redirect, then deploy it. It targets only known public
directory routes: assets, downloads, the Word task pane and unknown URLs are
not rewritten. Existing HTTPS/domain redirects remain in place. The old .com
domain retains its existing permanent redirect; its nameservers are still
Porkbun and it is outside this Cloudflare zone.

## HSTS

Open SSL/TLS → Edge Certificates → HTTP Strict Transport Security (HSTS).
Enable HSTS and set Max Age to **12 months (31536000 seconds)**.
Keep **Include subdomains off** and **Preload off**. Do not change other
settings as part of this correction. HTTPS must remain available for the
configured period. Expected response on HTTPS apex and www:

```text
Strict-Transport-Security: max-age=31536000
```

## Verify actual responses

Use GET without following redirects to inspect the first response:

```sh
curl -sS -D - -o /dev/null 'https://comparetwotexts.pro/pricing?utm_source=seo-check'
curl -sS -D - -o /dev/null 'https://www.comparetwotexts.pro/compare-word-documents?utm_source=seo-check'
curl -sS -D - -o /dev/null 'https://comparetwotexts.pro/'
curl -sS -D - -o /dev/null 'https://www.comparetwotexts.pro/'
```

The first two must return 301 with the canonical slash URL and original query.
The last two must include HSTS. Check all ten listed routes, existing slash URLs,
assets and a nonexistent URL; canonical pages stay 200 and unknown URLs stay404.
Only then rerun Semrush and request Google validation for the historical Word
redirect report. A temporary redirect did not establish the historical cause.

## Other audit items

- AI-agent access was restored by the owner. The live robots.txt at 08:04 UTC
  contains only `User-agent: *`, `Allow: /` and the sitemap. The managed
  Content-Signal line is gone, so the prior Semrush robots format error no longer
  reproduces. That file also no longer declares a training exclusion; inspect
  the Cloudflare Training policy separately if that preference should remain.
- Pricing receives links from the extension and Office add-in pages in this
  patch, using existing translated text.
- `llms.txt` lists public product pages and limits. It is optional for search;
  it is excluded from offline extension archives.
- /word-addin/ remains an intentionally unindexed pilot. Its visible
  /office-addins/ landing page is indexable.
- Keep license/download files and attribution links. The five historical Google
  duplicates are licenses (see SEO-HOSTING-2026-11-12.md); 13 single-inbound-link
  Semrush notices concern licenses or downloads, not missing product navigation.
- Semrush's privacy content notice has no actionable explanation in the API.
  Do not change factual privacy terms or add keywords to force a score change.
- Google exports dated 14 November end on 9 November. They are not proof of
  continuing post-migration faults. New live inspection is needed for the old
  404 example; its URL is not present in the available exports.

## References

- https://developers.cloudflare.com/rules/url-forwarding/single-redirects/create-dashboard/
- https://developers.cloudflare.com/rules/url-forwarding/single-redirects/settings/
- https://developers.cloudflare.com/ssl/edge-certificates/additional-options/http-strict-transport-security/
- https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/
