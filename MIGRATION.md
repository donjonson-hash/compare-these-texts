# Standalone repository extraction

Compare These Texts was extracted from `ctt/` in
https://github.com/donjonson-hash/kristina-revolutionary
at source revision `7ec380657bf61f9c153e6139722ae77df4095480` (version 0.35.0).

The 26 commits affecting that directory retain their authors, dates and messages.
Paths are now relative to the new repository root, so commit hashes change.
The extracted tip before migration adjustments is
`11ed97cac7933af3d133a947e55df02998adcae6`; its tree exactly matches the original
`ctt/` tree `d27f8d61d4742a2d7f726dd0c8bc9952e302303d`.
Earlier development before the source import remains referenced in `HISTORY.md`
and `provenance.json`, with the original repository retaining its full history.
GitHub issues, pull requests and Actions run records remain in that repository.

## Release continuity

The application version, browser extension identifiers, local-storage keys and
public domain are unchanged. No store upload or website deployment is performed
by this migration. CI builds and verifies artifacts but does not publish them.

The live website is managed separately by Sites:
`appgprj_6abb989515488191aefc8851ca4f8d6c`. For the next release, build this
repository and publish its `dist/` output to that existing site, preserving the
domain and access settings. Verify every packaged file matches the tested build
and inspect the published interface before reporting success.

The old project can be retired with a separate reviewed PR after the new remote
repository and its CI are confirmed. Do not run Kristina bot deployments from
this repository.
