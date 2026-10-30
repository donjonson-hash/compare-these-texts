// Regression for the exact installation ZIP, exercised by check:extension.
// All PDF contents are fictional and generated inside the offline extension.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

export async function checkExtensionPdf({context, editorUrl, checks}) {
  const page = await context.newPage();
  try {
    await page.goto(editorUrl);
    await page.locator('#header-edit').click();
    const fixture = await page.evaluate(async () => {
      const {PDFDocument, PDFName, fontkit} = await import('./pdf-vendor.mjs');
      const {default: fontData} = await import('./pdf-font.mjs');
      const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
      const font = await pdf.embedFont(Uint8Array.from(atob(fontData), char => char.charCodeAt(0)), {subset:true});
      pdf.setTitle('about:blank');
      const uri = pdf.context.lookup(pdf.context.trailerInfo.Info).get(PDFName.of('Title'));
      for (let number = 1; number <= 6; number++) {
        pdf.addPage([500, 700]).drawText(`Release check page ${number}`, {font, size:14, x:50, y:600});
      }
      const first = pdf.getPages()[0];
      const links = Array.from({length:3}, () => ({Type:'Annot', Subtype:'Link',
        Rect:[50, 595, 220, 615], Border:[0, 0, 0], A:{Type:'Action', S:'URI', URI:uri}}));
      first.node.set(PDFName.of('Annots'), pdf.context.obj(links));
      const original = Array.from(await pdf.save());
      links[0].A.Next = {S:'JavaScript', JS:uri};
      first.node.set(PDFName.of('Annots'), pdf.context.obj(links));
      const unsafe = Array.from(await pdf.save());
      first.node.delete(PDFName.of('Annots'));
      const plain = Array.from(await pdf.save());
      return {original, unsafe, plain};
    });
    const original = Buffer.from(fixture.original);
    const file = (name, data) => ({name, mimeType:'application/pdf', buffer:Buffer.from(data)});
    const host = page.locator('#single-editor-host');
    const save = host.locator('[data-save-side="left"]');
    const download = async () => {
      const [result] = await Promise.all([page.waitForEvent('download'), save.click()]);
      return readFile(await result.path());
    };
    await page.locator('#single-file').setInputFiles(file('release-placeholder-links.pdf', original));
    await save.waitFor({state:'visible'});
    await page.waitForFunction(() => !document.querySelector('#single-editor-host [data-save-side="left"]')?.disabled);
    assert.match(await host.locator('[data-pdf-link-note="left"]').innerText(), /Edited PDF downloads do not retain clickable links/);
    for (let number = 1; number <= 6; number++) {
      await page.waitForFunction(number => document.querySelector('#single-editor-host .visual-page-nav')?.textContent.includes(`${number} / 6`), number);
      if (number < 6) await host.getByRole('button', {name:'Next page', exact:true}).click();
    }
    assert.deepEqual(await download(), original, 'unchanged PDF retains exact bytes and links');
    checks.push('pdf-placeholder-six-page-import-and-original-download');

    // A failed replacement must preserve the currently open PDF and its bytes.
    await page.locator('#single-file').setInputFiles(file('unsupported-action.pdf', fixture.unsafe));
    await page.waitForFunction(() => document.getElementById('single-notice')?.textContent.includes('Could not open'));
    assert.match(await page.locator('#single-notice').innerText(), /Your current document is still open/);
    assert.deepEqual(await download(), original);
    checks.push('pdf-chained-action-rejected-without-document-loss');

    await host.locator('[data-pdf-text-view="left"]').click();
    await host.locator('.visual-paragraph').filter({hasText:'Release check page 1'}).click();
    await host.locator('[data-edit-side="left"]').fill('Updated check page 1');
    await host.getByRole('button', {name:'Done ✓', exact:true}).click();
    const updated = await download();
    assert.notDeepEqual(updated, original);
    const parsed = await page.evaluate(async data => {
      const {readTextSource} = await import('./text-source.mjs');
      let binary = ''; for (const byte of data) binary += String.fromCharCode(byte);
      const result = await readTextSource({name:'downloaded.pdf', data:btoa(binary)});
      return {text:result.blocks.map(block => block.text).join('\n'), links:result.meta.link_count || 0};
    }, Array.from(updated));
    assert.match(parsed.text, /Updated check page 1/);
    assert.doesNotMatch(parsed.text, /Release check page 1/);
    assert.match(parsed.text, /Release check page 6/);
    assert.equal(parsed.links, 0, 'edited rebuilt PDF has no clickable annotations');
    assert.equal(await host.locator('a[href="about:blank"]').count(), 0);
    await host.getByRole('button', {name:'Undo edit', exact:true}).click();
    assert.deepEqual(await download(), original, 'Undo restores the original PDF download');
    checks.push('pdf-placeholder-edit-download-reimport-and-undo');

    await page.locator('#workspace-home').click();
    await page.locator('#home-left-file').setInputFiles(file('with-placeholders.pdf', original));
    await page.locator('#home-right-file').setInputFiles(file('without-placeholders.pdf', fixture.plain));
    await page.locator('#start-new-compare').click();
    const comparison = page.locator('#visual-review');
    await comparison.locator('[data-save-side="right"]').waitFor({state:'visible'});
    assert.match(await comparison.locator('[data-pdf-link-note="left"]').innerText(), /Link destinations are not compared/);
    assert.equal(await comparison.locator('a[href="about:blank"]').count(), 0);
    const [compared] = await Promise.all([page.waitForEvent('download'), comparison.locator('[data-save-side="left"]').click()]);
    assert.deepEqual(await readFile(await compared.path()), original);
    checks.push('pdf-placeholder-comparison-in-installed-extension');
  } finally {
    await page.close();
  }
}
