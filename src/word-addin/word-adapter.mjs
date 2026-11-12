import {validateText, inspectOoxml, PARAGRAPH_LIMIT, SNAPSHOT_MS} from './policy.mjs';

/** WordApi 1.4 only. No fetch, storage, telemetry or document serialization to a server. */
export function createWordAdapter(Word, {Parser = globalThis.DOMParser, now = Date.now} = {}) {
  let active = null, busy = false;
  const inspect = (xml, text, uniform = false) => inspectOoxml(xml, text, {Parser, uniform});
  const checkTracking = document => {
    if (document.changeTrackingMode !== 'Off') throw new Error('Turn off Track Changes for this pilot, or use Word’s own review tools.');
  };
  async function release(snapshot) {
    if (!snapshot) return;
    try {
      await Word.run([snapshot.range, snapshot.paragraph], async context => {
        snapshot.range.untrack(); snapshot.paragraph.untrack(); await context.sync();
      });
    } catch { /* A closed document can invalidate the proxy; no document write occurs here. */ }
  }
  async function discard() { const previous = active; active = null; await release(previous); }
  async function load() {
    if (busy) throw new Error('Wait for the current operation to finish.');
    busy = true;
    try {
      await discard();
      return await Word.run(async context => {
        const range = context.document.getSelection();
        range.load('text'); range.parentBody.load('type'); range.paragraphs.load('items');
        const parentControl = range.parentContentControlOrNullObject, parentTable = range.parentTableOrNullObject;
        parentControl.load('id'); parentTable.load('rowCount'); context.document.load('changeTrackingMode');
        await context.sync();
        validateText(range.text); checkTracking(context.document);
        if (!['MainDoc', 'Section'].includes(range.parentBody.type) || !parentControl.isNullObject || !parentTable.isNullObject || range.paragraphs.items.length !== 1) throw new Error('Select a single passage in an ordinary body paragraph, outside tables and content controls.');
        const paragraph = range.paragraphs.items[0].getRange('Content');
        paragraph.load('text'); range.load('text');
        const selectionXml = range.getOoxml(), paragraphXml = paragraph.getOoxml();
        const relation = paragraph.compareLocationWith(range);
        range.track(); paragraph.track();
        try {
          await context.sync();
          validateText(range.text); validateText(paragraph.text, {limit: PARAGRAPH_LIMIT});
          if (!['Contains', 'Equal'].includes(relation.value)) throw new Error('The selection moved while loading. Select it again.');
          const selectionFingerprint = inspect(selectionXml.value, range.text, true);
          const paragraphFingerprint = inspect(paragraphXml.value, paragraph.text);
          active = {range, paragraph, original: range.text, paragraphText: paragraph.text, selectionFingerprint, paragraphFingerprint, expires: now() + SNAPSHOT_MS};
          return {original: active.original};
        } catch (error) {
          range.untrack(); paragraph.untrack(); await context.sync(); throw error;
        }
      });
    } finally { busy = false; }
  }
  async function apply(replacement, reviewed) {
    if (busy) throw new Error('Wait for the current operation to finish.');
    validateText(replacement, {allowEmpty: true});
    if (reviewed !== replacement || !active || replacement === active.original) throw new Error('Preview your current edit before applying it.');
    busy = true;
    const snapshot = active; active = null; // One use, including uncertain write failures.
    let writeStarted = false;
    try {
      if (now() > snapshot.expires) throw new Error('This selection expired. Load and review it again.');
      await Word.run([snapshot.range, snapshot.paragraph], async context => {
        const {range, paragraph} = snapshot;
        const current = context.document.getSelection();
        range.parentBody.load('type'); range.paragraphs.load('items');
        const parentControl = range.parentContentControlOrNullObject, parentTable = range.parentTableOrNullObject;
        parentControl.load('id'); parentTable.load('rowCount');
        const location = range.compareLocationWith(current), inside = paragraph.compareLocationWith(range);
        range.load('text'); paragraph.load('text'); context.document.load('changeTrackingMode');
        const selectionXml = range.getOoxml(), paragraphXml = paragraph.getOoxml();
        await context.sync();
        checkTracking(context.document);
        if (!['MainDoc', 'Section'].includes(range.parentBody.type) || !parentControl.isNullObject || !parentTable.isNullObject || range.paragraphs.items.length !== 1) throw new Error('The passage is no longer in a supported ordinary paragraph. Load another selection.');
        if (location.value !== 'Equal' || !['Contains', 'Equal'].includes(inside.value)) throw new Error('The selection changed. Load the intended passage again.');
        if (now() > snapshot.expires || range.text !== snapshot.original || paragraph.text !== snapshot.paragraphText || inspect(selectionXml.value, range.text, true) !== snapshot.selectionFingerprint || inspect(paragraphXml.value, paragraph.text) !== snapshot.paragraphFingerprint) throw new Error('The original text or formatting changed. Load the selection and review your edit again.');
        // One write to the original tracked selection. Paragraphs outside it are untouched.
        // Word supplies the selected range’s character formatting to the inserted text.
        writeStarted = true;
        range.insertText(replacement, 'Replace');
        await context.sync();
      });
      return {message: 'Applied to the selected passage. Check the result and save in Word. Use Word Undo to revert.'};
    } catch (error) {
      if (writeStarted) throw new Error('Word did not confirm the write. Check the document before retrying; your draft remains in this panel.');
      throw error;
    } finally { await release(snapshot); busy = false; }
  }
  return {load, apply, discard};
}
