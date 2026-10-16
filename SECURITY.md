# Security reports

Please do not include confidential documents, credentials or exploit details
in public issues. Use synthetic documents when reproducing a problem.

If GitHub shows **Security → Report a vulnerability** on this repository, use
that private reporting form:
https://github.com/donjonson-hash/compare-these-texts/security/advisories/new

Private vulnerability reporting is a repository setting and must be enabled by
the owner; this file does not enable it. If the form is unavailable, open a
public issue titled **Request a private security contact**, without technical
details or attachments. Wait for a private channel before sharing the report.

Include the release version, browser/host version, reproduction steps using
synthetic data, expected behaviour and actual behaviour. Only the latest release
is actively maintained; there is no promised response time or bounty programme.

Browser files are processed locally. Saved drafts have a seven-day retention
window and are cleaned on the next store read after expiration, not by a
background service. The Google Docs prototype uses Google services; its separate
README explains temporary server-side storage.

CI source-policy checks and vendor checksums are regression controls. They do
not prove the absence of vulnerabilities or replace review of bundled libraries.
