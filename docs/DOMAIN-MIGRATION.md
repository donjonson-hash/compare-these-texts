# Compare Two Texts: domain migration

Product name: **Compare Two Texts**. Repository and internal `ctt` identifiers
stay unchanged, preserving extension identity and saved drafts.

## Prepared on 24 October 2026

Both domains are assigned to the same Sites project:
`appgprj_6abb989515488191aefc8851ca4f8d6c`.

- `comparethesetexts.com`: active, HTTPS active.
- `comparetwotexts.pro`: added; DNS validation and certificate issuance pending.

The new domain is not a separate deployment. After validation, both hostnames
can serve the exact same application version. Do not redirect existing users to
it until HTTPS and the application have been verified.

## Porkbun DNS for comparetwotexts.pro

Use DNS management for **comparetwotexts.pro**, not the existing .com domain.
Remove conflicting parking/forwarding A, AAAA or CNAME records for the apex only.
Keep unrelated mail and other DNS records.

| Type | Host in Porkbun | Value |
| --- | --- | --- |
| A | blank (root domain) | `162.159.143.30` |
| A | blank (root domain) | `172.66.3.26` |
| TXT | `_openai-site-verification` | `openai-site-verification=p5KpdQ4KehbgDd6pQXNymYhJSrZq3EiX1KYdSqrXkbQ` |
| TXT | `_cf-custom-hostname` | `d6a8a466-0f03-4a7b-a1f1-e06c785616e6` |

These are the exact records returned by Sites for this custom domain. Keep the
validation TXT records. Refresh the domain status using Sites after DNS changes;
follow any additional certificate validation records returned by the provider.
`www.comparetwotexts.pro` is not attached and is not part of this setup.

## Recommended final arrangement

1. Verify `https://comparetwotexts.pro/`, `/privacy/`, `/support/`, `/terms/`,
   `/extension/`, assets and extension download links, including HTTPS.
2. Change website absolute URLs, extension `homepage_url`, support/store links
   and metadata to the new origin. Add a self-referencing canonical to public
   HTML pages and a sitemap listing the new URLs. Retain old links until this
   activation step; do not advertise an unverified hostname.
3. Configure **server-side 301 redirects** from each old URL to its matching
   new URL, preserving the path. Test the HTTPS old address and deep links, not
   only the homepage. No JavaScript or masked-frame forwarding.
4. If using Porkbun forwarding on the old domain, enable 301 and full-path
   forwarding according to its current UI. This requires changing that domain's
   hosting DNS; only do so after the new hostname is verified. Do not combine
   forwarding records with the old Sites apex records.
5. Verify both properties in Google Search Console, submit the new sitemap and
   use Change of Address where eligible. Keep old-domain redirects for at least
   one year, preferably while old links remain in use.

If both addresses must remain independently visible during transition, nominate
one canonical per page and use only that origin in the sitemap and public links.
Do not operate two divergent copies of the application.

Saved browser drafts are scoped to their origin. Changing the domain does not
transfer local IndexedDB/local storage. Users should download their edited files
on the old origin before moving; the extension's stable ID is preserved.

## References

- https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes
- https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- https://porkbun.com/products/url_forwarding
