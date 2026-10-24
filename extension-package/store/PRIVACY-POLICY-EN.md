# Compare Two Texts — privacy policy copy

Store kit 0.37.4, checked 24 October 2026. This is a readable copy of the
policy included in the extension, not a separate policy with different terms.
Published policy: https://comparetwotexts.pro/privacy/

Privacy policy · Updated October 24, 2026

## What the app reads

Compare Two Texts (CTT) reads the files or text you choose to open, including document names, text, tables and supported images. It uses them to show differences, apply your edits and create downloads. Document contents are processed in your browser and are not uploaded to the developer, a comparison server or an AI service.

## Saved work on this device

The app keeps one comparison and one Edit & export document separately in local browser storage. Saved work includes the original files, edits, supported undo history and view settings. Wait for Saved in this browser before closing. Private browsing, storage limits or browser settings can prevent saving.

Saved work expires after 7 days without opening or saving it. Expired work is removed the next time you open the app; CTT cannot erase browser storage while it is closed. Older drafts receive a fresh 7-day period when first opened after the retention update. Download files you want to keep.

## How saved drafts are protected

Saved document names, original files, edits, supported undo history and reports are encrypted with AES-GCM-256 before being written to browser storage. Each saved record has a randomly generated key and encryption nonce. The key is non-extractable through the Web Crypto API and is kept in the same browser profile so you can resume without a password. Storage version, revision identifiers and activity/expiry times remain unencrypted.

This protects the stored document representation; it is not a password-protected vault. Someone who can run code in your unlocked browser profile may still access your drafts. Documents are decrypted in memory while you work, and downloaded files are not encrypted by this feature.

Valid drafts from older versions are encrypted when opened in this version. If encryption or saving fails, the app shows an error and does not replace the old draft with a new plaintext save. The existing draft is left intact. Deleting or expiring a draft removes its stored content and encryption key; this is not a guarantee of secure erasure from disk or backups.

## Delete a saved draft

In a Word, PDF or text comparison, open All tools → Files & settings → Saved work → Finish and delete. In Edit & export, open Document options → Saved work → Delete saved work. Other comparison views show the Saved work control beside the saved-work status.

You can also clear the relevant website data or remove the extension to remove its local browser data. Replacing a saved document replaces that workspace’s draft. Downloaded files stay wherever you saved them and must be deleted separately.

## Separate workspaces, no automatic sync

comparetwotexts.pro, comparethesetexts.com and each installed extension have separate browser storage. A draft saved in one does not appear in the others or on another device. To move a document, download it and open it in the other workspace. Delete saved work in each workspace where you used it, especially on a shared computer.

## No tracking or external AI

The extension does not send document contents, browsing history, analytics or diagnostic telemetry to us. It does not read other tabs or automatically access files on your computer. Its processing libraries are included, so it works offline. Explain changes runs locally and does not send a conversation to an AI provider. We do not sell document data or use it for advertising or model training.

## Website and support connections

Loading the website needs an internet connection. The hosting provider receives standard connection information, such as your IP address and the requested page. We do not add advertising trackers. Opening an external website or support link leaves the offline workspace and is subject to that service’s privacy policy.

If you submit feedback through GitHub, GitHub receives what you submit and your account information under its own policy. Public issue reports are visible to others. Use a small fictional example instead of confidential documents or personal information. We use voluntarily submitted feedback to respond and improve the product.

## Chrome Web Store Limited Use

The use of information in this extension complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Questions and policy changes

Contact the maintainer through GitHub support. We will update this policy when data practices change and disclose material changes in the app before they take effect.

Support: https://comparetwotexts.pro/support/
