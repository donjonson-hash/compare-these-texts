# Enable private vulnerability reports

`SECURITY.md` describes the reporting policy. It cannot turn on the GitHub
repository setting. The GitHub App connection used for this work has no
administration access, so enabling or verifying that setting was not possible.

An owner or administrator should open:
https://github.com/donjonson-hash/compare-these-texts/settings

1. Select **Advanced Security** in the sidebar.
2. Next to **Private vulnerability reporting**, select **Enable** if disabled.
3. Open the repository's **Security → Advisories** page and verify that
   **Report a vulnerability** is available. Do not submit a test vulnerability.

Official instructions:
https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository

The report form is:
https://github.com/donjonson-hash/compare-these-texts/security/advisories/new

Until enablement is confirmed, keep the conditional wording in `SECURITY.md`.
Do not publish confidential reports in issues or add an unverified contact email.
