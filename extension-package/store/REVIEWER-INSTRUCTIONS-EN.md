# Reviewer instructions — Compare Two Texts 0.37.6

No account, sign-in, payment, API key or external AI service is required. The
editor and welcome page are in English. Synthetic examples are built in, so
review does not require private documents.

## Open the extension

1. Install the supplied Chrome extension package. Its local welcome page opens
   on first installation; an update does not automatically open another tab.
2. Choose **Open workspace**. The toolbar icon can also open the workspace.
3. Use **Getting started** in the editor footer to reopen the welcome page.
   **Try an example** on that page opens the synthetic document comparison.

## Compare and edit documents

1. From the home screen, open **Help → Try document editing**.
2. Inspect the two synthetic documents side by side. Select a highlighted change
   or use difference navigation. Edit a supported paragraph on one side.
3. Use **Undo** to restore the previous text. Apply the edit again manually,
   then download the DOCX from that side's download controls. The downloaded
   document should contain the chosen edit.
4. Select **PDF** for that Word document and open **Preview PDF**. Inspect the
   preview, select **Download PDF**, then **Back to editing**. The source remains
   editable after PDF export.

## Find additional tools

In a document comparison, open **All tools** next to difference navigation.
Choose a labeled section:

- **Review & edit**: find/replace, step-by-step review, amounts/percentages,
  zoom, whole-document copying and restoration of the originals.
- **Files & settings**: source files, comparison settings and saved-work controls.
- **Reports**: explanatory summaries and available report downloads.

The tab labels identify the tools without expanding the main document header.
Close the tools window to return to the document. **Wording & style** opens
stylistic observations separately where available. Undo is supported; an
application-level Redo command is not included.

## Compare tables

1. Use **Home**, then **Help → CSV / Excel example**.
2. Review the synthetic changed and missing rows. Select a changed cell, edit
   its value, and use the table's available download option.
3. Missing rows can be copied from A to B. Comparison checks the selected sheet
   and columns; it does not compare chart artwork or workbook formulas.

## Edit one document and replace it

1. Select **Edit & convert** in the header; the **Edit & export** area opens.
2. Choose a supported DOCX or text-based PDF. The document opens and the upload
   information collapses to leave room for editing.
3. For DOCX, choose **PDF → Preview PDF → Download PDF**. Supported text
   headers/footers, page numbers and plain horizontal rules are included.
4. Select **Open new document** to choose another file. **Document options**
   reveals upload/settings controls. An unsupported replacement shows an error
   while leaving the current document available.
5. Optional PDF form test: open a PDF with selectable text and printed blank
   lines. Click a detected blank to enter text, or use **Add text**. These are
   printed blanks, not interactive PDF widgets.

## Saved work and offline operation

Saved comparison and single-document payloads are encrypted using AES-GCM-256.
The non-extractable key stays in the local browser profile; no password or
network request is needed to resume. Valid older plaintext drafts are migrated
on load, and failures do not silently fall back to plaintext persistence.

1. Wait for **Saved in this browser** after an edit, then close and reopen the
   workspace. Use its resume control to continue the saved draft.
2. For a comparison, use **All tools → Files & settings → Saved work → Finish and delete**.
   For one document, use **Document options → Saved work → Delete saved work**.
   Comparison and single-document work have separate saved drafts.
3. Repeat a built-in comparison with the network offline. File processing,
   editing and export use bundled code. Public website/support links need a
   connection and are not required for the workflow.

## Scope and expected limitations

- Input files: up to 2 MiB each. Legacy `.doc` is not supported; save a `.docx`
  copy in Word or LibreOffice first. Renaming a file is not conversion.
- PDFs need a selectable text layer. No OCR, scanned-image comparison,
  interactive PDF widgets or PDF comments.
- Only supported DOCX structures are imported. Actual footnotes, endnotes,
  comments and unsupported complex layouts are rejected with an explanation.
- Headers and footers are read-only and are not part of text comparison.
  Supported PDF layouts include them; unsupported PDF structures are refused
  rather than silently discarded. Font appearance and pagination may differ
  from Microsoft Word; the preview shows the result before download.
- Two-file spreadsheet comparison requires one header row, no merged cells
  and values instead of formulas.
- Images, formatting and legal meaning are not compared. Local explanatory
  summaries concern the original comparison; reopen edited downloads to compare
  the final versions again.
