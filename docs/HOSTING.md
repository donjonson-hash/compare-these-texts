# Website security headers

The document-processing CSP remains in each HTML page and in the extension
manifest. Meta CSP cannot enforce frame-ancestors. `src/_headers` supplies the
additional HTTP policies for hosts that support Cloudflare static-asset header
rules; the build copies it to `dist/_headers`. It is excluded from extension ZIPs.

Required response headers for HTML routes are:

| Header | Value |
| --- | --- |
| Content-Security-Policy | `frame-ancestors 'none'` (in addition to the page's meta CSP) |
| X-Frame-Options | `DENY` |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `no-referrer` |
| Strict-Transport-Security | `max-age=31536000` |

HSTS deliberately omits includeSubDomains and preload. Do not enable either
without verifying every affected subdomain and agreeing on the deployment policy.

`_headers` is a hosting input, not browser JavaScript. Hosts using a custom Worker
response or a different static platform may ignore it and must set equivalent
response headers in their own configuration. Cloudflare documents this distinction:
https://developers.cloudflare.com/workers/static-assets/headers/

The current site is published with Sites, separately from GitHub Actions. Do not
assume Sites applies `_headers` merely because it accepts the deployment archive.
After deployment, check the actual responses for `/`, `/privacy/`, `/support/`
and `/extension/` on both comparethesetexts.com and the generated Sites origin:

```sh
curl -sS -D - -o /dev/null https://comparethesetexts.com/
```

The audit environment received HTTP 403 from both live origins on 2026-10-16,
so production headers could not be verified here. Keep the hosting portion of
the audit open until a successful browser/network response confirms the headers.
This is not a claim that the live site currently has anti-framing protection.

After publication of 0.35.2 on 2026-10-16, all eight URLs above again returned
HTTP 403 to this environment. Those error responses contained
`X-Frame-Options: SAMEORIGIN` and `Referrer-Policy: same-origin`, not the policies
in `_headers`. These are error-page observations; they do not establish which
headers a successful application response receives. Check from an unrestricted
client and retain the status code as well as headers; a 403 is not a passing
hosting verification result.
