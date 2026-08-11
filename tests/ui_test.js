const puppeteer = require('puppeteer-core');
const ROOT = require('path').resolve(__dirname, '..');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--allow-file-access-from-files', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  let lastDialog = ''; page.on('dialog', d => { lastDialog = d.message(); d.accept(); });
  const modalOk = async () => {
    await page.waitForSelector('#modal.on');
    lastDialog = await page.$eval('#modalMsg', el => el.textContent);
    await page.$eval('#modalOk', el => el.click());
  };

  page.on('pageerror', err => console.log('[pageerror]', err.message));
  let fail = 0;
  const check = (cond, name) => { console.log((cond ? 'ok  ' : 'FAIL') + ' ' + name); if (!cond) fail = 1; };

  await page.goto('file://' + ROOT + '/subtitle-console.html');
  await page.waitForSelector('#console');
  await new Promise(r => setTimeout(r, 400));

  // Music-first: a brand-new visitor lands in the music-only console
  check(await page.evaluate(() => document.body.classList.contains('mode-music')), 'fresh visitor lands in music-only mode');
  check(await page.$eval('#console', el => el.classList.contains('active')), 'fresh visitor sees the console, not a load screen');
  check(await page.$eval('#helpBtn', el => el.classList.contains('pulse')), 'first visit: help button pulses');
  await new Promise(r => setTimeout(r, 1100));
  check(await page.$eval('#toast', el => el.textContent.includes('60-second guide')), 'first visit: hint toast points at ?');
  await page.click('#helpBtn');
  await new Promise(r => setTimeout(r, 200));
  check(await page.$eval('#helpBtn', el => !el.classList.contains('pulse')) &&
        await page.$eval('#helpOverlay', el => el.classList.contains('on')), 'clicking ? stops pulse, opens guide');
  await page.keyboard.press('Escape');

  // The rest of this suite exercises the full console
  await page.waitForFunction('window.appReady');
  await page.evaluate(() => localStorage.setItem('subtitleTool.mode', 'full'));
  await page.reload();
  await page.waitForSelector('#dropZone');
  await page.screenshot({ path: 'shot_load.png' });

  // Load PDF via file input (same handler as drag-drop)
  const input = await page.$('#fileInput');
  await input.uploadFile(__dirname + '/test.pdf');
  await page.waitForSelector('#console.active', { timeout: 20000 });
  await new Promise(r => setTimeout(r, 400));

  check((await page.$$('.cueItem')).length === 8, 'cue list has 8 items');
  check(await page.$eval('#musicTab', el => el.style.display !== 'none'), 'right rail defaults to Music tab');
  await page.click('#tabMusic');
  check(await page.$eval('#musicTab', el => el.style.display !== 'none'), 'Music tab selectable');
  await page.click('#tabCues');
  check(await page.$eval('#cuesTab', el => el.style.display !== 'none') &&
        await page.$eval('#musicTab', el => el.style.display === 'none'), 'Cues tab shows subtitle list');
  // stay on Cues tab — the rest of this suite works the subtitle list
  await page.click('#tabMusic');
  await page.keyboard.press('n');
  await page.waitForSelector('.cueItem textarea');
  check(await page.$eval('#cuesTab', el => el.style.display !== 'none'), 'N key auto-switches to Cues tab for editing');
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 200));
  check((await page.$$('.cueItem')).length === 8, 'abandoned N-insert cleans up');

  // Top-bar navigation: projector button + Shows chip
  check(await page.$eval('#topBar #openOutputBtn', el => !!el), 'projector button lives in the top bar');
  check(await page.$eval('#outputBtnLabel', el => el.textContent === 'Projector view'), 'projector button says Projector view');
  await page.click('#showsBtn');
  await page.waitForSelector('#showCards');
  await new Promise(r => setTimeout(r, 200));
  check(await page.$$eval('.showCard', els => els.length >= 2), 'Shows chip opens the gallery from the console');
  check(await page.$eval('#scriptIntake', el => !el.classList.contains('open')), 'chip view: cards are the hero, script intake tucked away');
  check(await page.evaluate(() => {
    const ls = document.getElementById('loadScreen');
    const kids = [...ls.children].filter(e => getComputedStyle(e).display !== 'none' && e.tagName !== 'INPUT');
    const top = kids[0].getBoundingClientRect().top;
    const bot = window.innerHeight - kids[kids.length - 1].getBoundingClientRect().bottom;
    return Math.abs(top - bot) < 60;
  }), 'shows view vertically centered (no bottom-sink)');
  await page.click('#addScriptBtn');
  check(await page.$eval('#scriptIntake', el => el.classList.contains('open')), 'Add a script expands the intake');
  await page.click('#addScriptBtn');
  await page.click('#resumeBtn');
  await page.waitForSelector('#console.active');

  // Test card, cue sheet, help overlay
  await page.click('#testCardBtn');
  await new Promise(r => setTimeout(r, 250));
  check(await page.$eval('#previewTC', el => el.style.display === 'block' && el.children.length >= 3), 'test card renders in preview');
  await page.keyboard.press('ArrowRight');
  await new Promise(r => setTimeout(r, 250));
  check(await page.$eval('#previewTC', el => el.style.display === 'none'), 'advancing a cue dismisses the test card');
  await page.keyboard.press('ArrowLeft');

  await page.click('#showsBtn');
  await page.waitForSelector('#showCards');
  await new Promise(r => setTimeout(r, 200));
  check(await page.$eval('#printBtn', el => el.style.display !== 'none'), 'print offered on shows view when show has content');
  const sheetPromise = new Promise(res => page.once('popup', res));
  await page.click('#printBtn');
  const sheet = await sheetPromise;
  await new Promise(r => setTimeout(r, 400));
  check(await sheet.evaluate(() => document.body.textContent.includes('cue sheet') && document.body.textContent.includes('Subtitle cues')), 'cue sheet opens with content');
  await sheet.close();
  await page.click('#resumeBtn');
  await page.waitForSelector('#console.active');

  // Subtitle deck PDF: one 16:9 page per cue + blank bookends
  await page.click('#showsBtn');
  await page.waitForSelector('#showCards');
  await new Promise(r => setTimeout(r, 200));
  const deckPath = __dirname + '/My-show-subtitles.pdf';
  try { require('fs').unlinkSync(deckPath); } catch (e) {}
  const cdpDeck = await page.createCDPSession();
  await cdpDeck.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: __dirname, eventsEnabled: true });
  check(await page.$eval('#pdfDeckBtn', el => el.style.display !== 'none'), 'PDF deck offered when show has cues');
  await page.click('#pdfDeckBtn');
  for (let i = 0; i < 100 && !require('fs').existsSync(deckPath); i++) await new Promise(r => setTimeout(r, 200));
  check(require('fs').existsSync(deckPath), 'deck PDF downloads');
  const deck = require('fs').readFileSync(deckPath);
  check(deck.slice(0, 5).toString() === '%PDF-', 'deck is a PDF');
  const pageCount = (deck.toString('latin1').match(/\/Type \/Page \/Parent/g) || []).length;
  check(pageCount === 10, 'deck has 8 cue pages + 2 blank bookends: ' + pageCount);
  // pdf.js itself must parse our hand-rolled file (image pages → "no readable text")
  const probe = await browser.newPage();
  await probe.goto('file://' + ROOT + '/subtitle-console.html?test=' + encodeURIComponent('file://' + deckPath));
  await probe.waitForSelector('#testout', { timeout: 30000 });
  const probeResult = await probe.$eval('#testout', el => el.textContent);
  check(probeResult.includes('No readable text'), 'pdf.js parses the deck cleanly (image-only, as designed)');
  await probe.close();
  await page.click('#resumeBtn');
  await page.waitForSelector('#console.active');

  await page.click('#helpBtn');
  await new Promise(r => setTimeout(r, 200));
  check(await page.$eval('#helpOverlay', el => el.classList.contains('on')), 'help overlay opens');
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 200));
  check(await page.$eval('#helpOverlay', el => !el.classList.contains('on')), 'Escape closes help');
  check(await page.$eval('#cueCounter', el => el.textContent.startsWith('—')), 'starts in pre-show blank');
  check((await page.$eval('#nextText', el => el.textContent)).startsWith('The audience waits'), 'NEXT shows first cue at pre-show');

  // Advance 3 cues with keyboard
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await new Promise(r => setTimeout(r, 200));
  const now3 = await page.$eval('#previewText', el => el.textContent.replace(/\n/g, ' '));
  check(now3 === 'Dr. Aslam enters from the left.', 'keyboard advance → cue 3: ' + now3);
  check(await page.$eval('#nextText', el => el.textContent) === 'He carries a lantern.', 'NEXT slot shows upcoming cue');
  check(await page.$$eval('#thenList .thenRow', els => els.length === 3 && els[0].textContent.includes('What do you want')), 'THEN lists next three cues');
  check(await page.$eval('#cueCounter', el => el.textContent.startsWith('3 / 8')), 'counter shows 3 / 8');
  check(await page.$$eval('.cueItem.current', els => els.length === 1 && els[0].dataset.i === '2'), 'list highlight follows');

  // Open output window
  const popupPromise = new Promise(res => page.once('popup', res));
  await page.click('#openOutputBtn');
  const out = await popupPromise;
  await new Promise(r => setTimeout(r, 500));
  const outText = await out.$eval('#text', el => el.textContent.replace(/\n/g, ' '));
  check(outText === 'Dr. Aslam enters from the left.', 'output window shows current cue');
  const bg = await out.$eval('#stage', el => el.style.background);
  check(bg.includes('rgb(0, 0, 0)') || bg === 'black' || bg === '#000000', 'output bg is black: ' + bg);

  // Style change: font size + colours propagate live
  await page.$eval('#sizeCtl', el => { el.value = 100; el.dispatchEvent(new Event('input')); });
  await page.$eval('#bgCtl', el => { el.value = '#1a0a2e'; el.dispatchEvent(new Event('input')); });
  await page.$eval('#colorCtl', el => { el.value = '#ffd700'; el.dispatchEvent(new Event('input')); });
  await page.$eval('#posCtl', el => { el.value = 50; el.dispatchEvent(new Event('input')); });
  await new Promise(r => setTimeout(r, 300));
  const fs2 = await out.$eval('#text', el => parseFloat(el.style.fontSize));
  const oh = await out.evaluate(() => document.getElementById('stage').clientHeight);
  check(Math.abs(fs2 - 100 * oh / 1080) < 1, 'font size scales to output height (' + fs2.toFixed(1) + 'px @ ' + oh + 'h)');
  check((await out.$eval('#text', el => el.style.color)) === 'rgb(255, 215, 0)', 'text colour propagates');
  check((await out.$eval('#text', el => el.style.top)) === '50%', 'vertical position propagates');

  // Blank toggle
  await page.keyboard.press('b');
  await new Promise(r => setTimeout(r, 300));
  check((await out.$eval('#text', el => el.textContent)) === '', 'blank hides output text');
  check(await page.$eval('#blankBadge', el => el.classList.contains('on')), 'blank badge shows in preview');
  await page.keyboard.press('b');
  await new Promise(r => setTimeout(r, 300));
  check((await out.$eval('#text', el => el.textContent)) !== '', 'unblank restores text');

  // Edit a cue
  await page.$$eval('.cueItem', els => els[3].dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  await page.waitForSelector('.cueItem textarea');
  await page.$eval('.cueItem textarea', el => { el.value = 'He carries a bright red lantern.'; });
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 200));
  check(await page.$$eval('.cueItem', els => els[3].textContent.includes('bright red lantern')), 'cue edit saves');

  // Delete a cue (delete cue 1, current is index 2 -> shifts to 1)
  const nBefore = (await page.$$('.cueItem')).length;
  await page.$$eval('.cueItem .del', els => els[0].click());
  await modalOk();
  await new Promise(r => setTimeout(r, 200));
  check((await page.$$('.cueItem')).length === nBefore - 1, 'cue delete removes item');
  check(lastDialog.includes('Delete cue') && lastDialog.includes('Undo'), 'delete asked for confirmation first');
  check(await page.$eval('#previewText', el => el.textContent.replace(/\n/g, ' ')) === 'Dr. Aslam enters from the left.', 'current cue tracks after delete before it');
  check(await page.$eval('#cueCounter', el => el.textContent.startsWith('2 / 7')), 'counter updates after delete');

  // Undo restores the deleted cue, counter, and position
  await page.$eval('#toast button', el => el.click());
  await new Promise(r => setTimeout(r, 200));
  check((await page.$$('.cueItem')).length === 8, 'undo restores deleted cue');
  check(await page.$eval('#cueCounter', el => el.textContent.startsWith('3 / 8')), 'undo restores position');
  await page.$$eval('.cueItem .del', els => els[0].click());
  await modalOk();
  await new Promise(r => setTimeout(r, 200));
  check((await page.$$('.cueItem')).length === 7 &&
        await page.$eval('#cueCounter', el => el.textContent.startsWith('2 / 7')), 're-delete lands back at 7');

  // --- Insert cues ---
  await page.$$eval('.cueItem .add', els => els[0].click());
  await page.waitForSelector('.cueItem textarea');
  await page.keyboard.type('INSERTED CUE');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 200));
  check((await page.$$('.cueItem')).length === 8, 'insert-after adds a cue');
  check(await page.$$eval('.cueItem', els => els[1].textContent.includes('INSERTED CUE')), 'inserted cue is in position 2');
  check(await page.$eval('#previewText', el => el.textContent.replace(/\n/g, ' ')) === 'Dr. Aslam enters from the left.', 'current cue unchanged by insert before it');
  check(await page.$eval('#cueCounter', el => el.textContent.startsWith('3 / 8')), 'index shifts with insert before current');

  // abandoning an empty new cue removes it
  await page.$$eval('.cueItem .add', els => els[0].click());
  await page.waitForSelector('.cueItem textarea');
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 200));
  check((await page.$$('.cueItem')).length === 8, 'abandoned empty cue removes itself');

  // add at end
  await page.$eval('#addEndRow', el => el.click());
  await page.waitForSelector('.cueItem textarea');
  await page.keyboard.type('END CUE');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 200));
  check(await page.$$eval('.cueItem', els => els.length === 9 && els[8].textContent.includes('END CUE')), 'add-at-end appends cue');

  // clean up the two inserted cues so later counts hold
  await page.$$eval('.cueItem .del', els => els[1].click());
  await modalOk();
  await new Promise(r => setTimeout(r, 150));
  await page.$$eval('.cueItem .del', els => els[7].click());
  await modalOk();
  await new Promise(r => setTimeout(r, 150));
  check((await page.$$('.cueItem')).length === 7, 'cleanup back to 7 cues');
  check(await page.$eval('#cueCounter', el => el.textContent.startsWith('2 / 7')), 'index correct after cleanup');

  // Screenshots
  await out.setViewport({ width: 960, height: 540 });
  await new Promise(r => setTimeout(r, 200));
  await out.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.screenshot({ path: 'shot_console.png' });
  await out.screenshot({ path: 'shot_output.png' });

  // Persistence: reload → auto-restore straight into the console
  await page.reload();
  await page.waitForSelector('#console.active', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 300));
  const nowR = await page.$eval('#previewText', el => el.textContent.replace(/\n/g, ' '));
  check(nowR === 'Dr. Aslam enters from the left.', 'auto-restore: position kept: ' + nowR);
  const nextR = await page.$eval('#nextText', el => el.textContent);
  check(nextR.includes('bright red lantern'), 'auto-restore: edits kept: ' + nextR);
  check((await page.$$('.cueItem')).length === 7, 'auto-restore: 7 cues back');

  // Load-new-script screen is non-destructive: back button returns
  await page.click('#newPdfBtn');
  await page.waitForSelector('#dropZone');
  await new Promise(r => setTimeout(r, 200));
  check(await page.$eval('#resumeBtn', el => el.style.display !== 'none' && el.textContent.includes('Back to the loaded show (7 cues)')), 'load screen offers way back');
  check(await page.$eval('#scriptIntake', el => el.classList.contains('open')), 'Load new script arrives with the intake open');
  await page.click('#resumeBtn');
  await page.waitForSelector('#console.active');
  await new Promise(r => setTimeout(r, 200));
  check(await page.$eval('#previewText', el => el.textContent.replace(/\n/g, ' ')) === 'Dr. Aslam enters from the left.', 'back button returns to same position');

  // --- Export / import round-trip (one export: the full bundle) ---
  const fs = require('fs');
  const dlPath = __dirname + '/My-show.cueshow.zip';
  try { fs.unlinkSync(dlPath); } catch (e) {}
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: __dirname, eventsEnabled: true });
  await page.click('#showsBtn');
  await page.waitForSelector('#showCards');
  await new Promise(r => setTimeout(r, 200));
  await page.$$eval('.showCard.cur .cmenuBtn', els => els[0].click());
  await new Promise(r => setTimeout(r, 150));
  await page.$$eval('#cardMenu button', els => els.find(b => b.textContent.includes('Export show file')).click());
  for (let i = 0; i < 50 && !fs.existsSync(dlPath); i++) await new Promise(r => setTimeout(r, 100));
  check(fs.existsSync(dlPath), 'Export show downloads the full bundle');
  check(fs.readFileSync(dlPath).slice(0, 2).toString() === 'PK', 'bundle is a standard zip');

  // wipe everything, then import the bundle like a fresh venue laptop
  await page.waitForFunction('window.appReady');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('subtitleTool.mode', 'full'); });
  await page.reload();
  await page.waitForSelector('#dropZone');
  check(await page.$eval('#resumeBtn', el => el.style.display === 'none' || !el.textContent), 'fresh start: no resume offered');
  const input2 = await page.$('#fileInput');
  await input2.uploadFile(dlPath);
  await page.waitForSelector('#console.active', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 300));
  check((await page.$$('.cueItem')).length === 7, 'import restores 7 cues');
  check(await page.$eval('#cueCounter', el => el.textContent.startsWith('2 / 7')), 'import restores show position');
  check(await page.$eval('#sizeCtl', el => el.value) === '100', 'import restores style settings');
  check(await page.$$eval('.cueItem', els => els[2].textContent.includes('bright red lantern')), 'import keeps edits');

  // --- Paste-text path ---
  await page.waitForFunction('window.appReady');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('subtitleTool.mode', 'full'); });
  await page.reload();
  await page.waitForSelector('#pasteBox');
  await page.screenshot({ path: 'shot_load.png' });
  await page.$eval('#pasteBtn', el => el.click());
  await new Promise(r => setTimeout(r, 200));
  check(await page.$eval('#loadStatus', el => el.textContent.includes('Paste some text')), 'empty paste rejected with message');
  await page.$eval('#pasteBox', el => {
    el.value = 'The hall falls silent. [The lights dim.] A voice rises (from the dark) and calls his name over the water and the waiting crowd below. He answers.\nThe river runs cold,\nand the night is long\nThe *storm* breaks over Kurukshetra';
  });
  await page.$eval('#pasteBtn', el => el.click());
  await page.waitForSelector('#console.active', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 300));
  const pasteCues = await page.$$eval('.cueItem .txt', els => els.map(e => e.textContent));
  check(pasteCues.length === 7, 'paste creates 7 cues, got ' + pasteCues.length + ': ' + JSON.stringify(pasteCues));
  check(pasteCues[6] === 'The storm breaks over Kurukshetra', 'markers hidden in rendered list text');
  check(await page.$$eval('.cueItem em', els => els.length === 1 && els[0].textContent === 'storm'), 'cue list renders *storm* as <em>');
  check(pasteCues[4] === 'The river runs cold,' && pasteCues[5] === 'and the night is long', 'line breaks become new cues even after a comma / no punctuation');
  check(!pasteCues.some(c => /[\[\]()]/.test(c)), 'paste strips stage directions');
  check(await page.$eval('#cueCounter', el => el.textContent.startsWith('—')), 'paste starts at pre-show blank');
  check(pasteCues.every(c => c.replace('↳ ', '').split(' ').length <= 12), 'paste cues obey 12-word max');
  await page.$$eval('.cueItem', els => els[6].click());
  await new Promise(r => setTimeout(r, 200));
  check(await page.$eval('#previewText', el => {
    const em = el.querySelector('em');
    return em && em.textContent === 'storm' && getComputedStyle(em).fontStyle === 'italic';
  }), 'preview/output renders emphasis in italics');
  await page.evaluate(() => {
    cues[index].text = 'The ***storm*** breaks with **thunder** tonight';
    renderAll();
  });
  await new Promise(r => setTimeout(r, 200));
  check(await page.$eval('#previewText', el => {
    const both = el.querySelector('strong em, em strong');
    const bold = [...el.querySelectorAll('strong')].some(s => s.textContent.includes('thunder'));
    return both && both.textContent === 'storm' && bold;
  }), '**bold** and ***bold italic*** render on stage');

  // --- Two-line stage display ---
  await page.$$eval('.cueItem', els => els[1].click());   // 10-word cue
  await new Promise(r => setTimeout(r, 200));
  const twoLine = await page.$eval('#previewText', el => el.textContent);
  check(twoLine === 'A voice rises and calls\nhis name over the water', 'long cue splits 5+5 on stage: ' + JSON.stringify(twoLine));
  await page.$$eval('.cueItem', els => els[3].click());   // "He answers." (2 words)
  await new Promise(r => setTimeout(r, 200));
  check(!(await page.$eval('#previewText', el => el.textContent)).includes('\n'), 'short cue stays on one line');
  check(!(await page.$eval('#nextText', el => el.textContent)).includes('\n'), 'operator NEXT stays single-line');

  // Logo in the top bar leads home, same as the shows button
  await page.click('#brandHome');
  await new Promise(r => setTimeout(r, 200));
  check(await page.$eval('#loadScreen', el => getComputedStyle(el).display !== 'none'), 'logo click opens the shows screen');
  await page.click('#resumeBtn');
  await new Promise(r => setTimeout(r, 200));
  check(await page.$eval('#console', el => el.classList.contains('active')), 'resume returns to console after logo click');

  // --- Clear saved data ---
  await page.click('#newPdfBtn');
  await page.waitForSelector('#dropZone');
  await new Promise(r => setTimeout(r, 200));
  check(await page.$eval('#clearBtn', el => el.style.display !== 'none'), 'clear button visible when data saved');
  await page.click('#clearBtn');
  await modalOk();
  await new Promise(r => setTimeout(r, 300));
  check(await page.$eval('#loadStatus', el => el.textContent.includes('cleared')), 'clear confirms in status');
  check(await page.$eval('#resumeBtn', el => el.style.display === 'none'), 'no resume after clear');
  check(await page.$eval('#clearBtn', el => el.style.display === 'none'), 'clear button hides itself');
  check(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('subtitleTool') && !['subtitleTool.rtab', 'subtitleTool.mode', 'subtitleTool.uiScale', 'subtitleTool.shows', 'subtitleTool.helpHinted'].includes(k)).length === 0), 'localStorage keys removed');
  check(await page.$eval('#sizeCtl', el => el.value) === '64', 'styling reset to defaults');
  check(await page.$$eval('.showCard', els => els[0].textContent.includes('0 subtitle cues') && els[0].textContent.includes('0 music cues')), 'show card counts refresh after clear');
  await page.reload();
  await page.waitForSelector('#dropZone');
  check(await page.$eval('#resumeBtn', el => el.style.display === 'none' || el.style.display === ''), 'fresh load screen after clear + reload');

  // --- Console modes ---
  await page.click('#musicOnlyBtn');
  await new Promise(r => setTimeout(r, 250));
  check(await page.$eval('#console', el => el.classList.contains('active')), 'continue-without-script opens the console');
  check(await page.$eval('#leftCol', el => getComputedStyle(el).display !== 'none'), 'no mode flip: still the full console');
  await page.select('#modeCtl', 'music');
  await new Promise(r => setTimeout(r, 250));
  check(await page.$eval('#leftCol', el => getComputedStyle(el).display === 'none'), 'music mode hides the subtitle half');
  check(await page.$eval('#rightTabs', el => getComputedStyle(el).display === 'none'), 'music mode hides tabs');
  check(await page.evaluate(() => document.querySelector('#musicTab').contains(document.querySelector('#keysHint'))), 'keys hint follows into music console');
  check(await page.$eval('#topBar .title', el => el.textContent.includes('Music')), 'music mode retitles console');
  await page.reload();
  await page.waitForSelector('#console.active', { timeout: 10000 });
  check(await page.$eval('#leftCol', el => getComputedStyle(el).display === 'none'), 'music mode persists across reload');
  await page.select('#modeCtl', 'full');
  await new Promise(r => setTimeout(r, 250));
  check(await page.$eval('#loadScreen', el => getComputedStyle(el).display !== 'none'), 'full mode without script returns to load screen');

  // A show with only music reopens into the console even in full mode
  await page.click('#musicOnlyBtn');
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => {
    musicCues.push({ id: musicUid++, name: 'bed', fileName: 'bed.wav', group: 'A', volume: 1,
      fadeIn: 0, fadeOut: 2, loop: false, startAt: 0, endAt: null,
      followMode: 'none', followDelay: 3, linkCue: null, linkMode: 'auto', duck: null, duration: null });
    saveMusic();
  });
  await page.reload();
  await page.waitForSelector('#console.active', { timeout: 10000 });
  check(await page.$eval('#leftCol', el => getComputedStyle(el).display !== 'none'), 'music-only show reopens into the FULL console, not the load screen');
  check(await page.evaluate(() => {
    const lc = document.querySelector('#leftCol');
    const kids = [...lc.children].map(e => e.id);
    return kids.indexOf('keysHint') < kids.indexOf('stylePanel') && kids.indexOf('setupPanel') === kids.length - 1;
  }), 'legend above settings, setup panel below it');
  await page.$eval('#pasteBox', el => { el.value = 'One. Two.'; });
  await page.$eval('#pasteBtn', el => el.click());
  await page.waitForSelector('#console.active');
  await page.select('#modeCtl', 'subtitles');
  await new Promise(r => setTimeout(r, 250));
  check(await page.$eval('#cuesTab', el => el.style.display !== 'none') &&
        await page.$eval('#rightTabs', el => getComputedStyle(el).display === 'none'), 'subtitles-only pins cue list and hides tabs');
  await page.select('#modeCtl', 'full');
  await new Promise(r => setTimeout(r, 250));
  check(await page.$eval('#rightTabs', el => getComputedStyle(el).display !== 'none'), 'full mode restores tabs');

  // Subtitle-stats toast stays out of music mode (even via auto-restore)
  await page.select('#modeCtl', 'music');
  await new Promise(r => setTimeout(r, 200));
  await page.reload();
  await page.waitForSelector('#console.active');
  await new Promise(r => setTimeout(r, 500));
  check(await page.$eval('#toast', el => !el.classList.contains('show') || !el.textContent.includes('words per cue')), 'no words-per-cue toast in music mode');
  await page.select('#modeCtl', 'full');
  await new Promise(r => setTimeout(r, 200));

  // UI scale
  await page.select('#uiScaleCtl', '125');
  await new Promise(r => setTimeout(r, 200));
  check(await page.$eval('body', el => el.style.zoom === '1.25' || parseFloat(el.style.zoom) === 1.25), 'UI size 125% applies zoom');
  await page.reload();
  await page.waitForSelector('#console.active');
  await new Promise(r => setTimeout(r, 300));
  check(await page.$eval('body', el => parseFloat(el.style.zoom) === 1.25), 'UI size persists across reload');
  check(await page.$eval('#uiScaleCtl', el => el.value === '125'), 'UI size control reflects saved value');
  // At 125% the console must fit the window and controls stay reachable
  check(await page.evaluate(() => {
    const r = document.getElementById('console').getBoundingClientRect();
    return r.bottom <= window.innerHeight + 2;
  }), 'zoomed console fits the window (no clipped fold)');
  check(await page.evaluate(() => {
    const lc = document.getElementById('leftCol');
    lc.scrollTop = lc.scrollHeight;
    const r = document.getElementById('setupPanel').getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight + 2;
  }), 'setup panel reachable by scrolling at 125%');
  await page.select('#uiScaleCtl', '100');
  await new Promise(r => setTimeout(r, 200));

  // Tab switches must not change the rail width
  const wMusic = await page.evaluate(() => { setRightTab('music'); return document.getElementById('rightCol').getBoundingClientRect().width; });
  const wCues = await page.evaluate(() => { setRightTab('cues'); return document.getElementById('rightCol').getBoundingClientRect().width; });
  check(Math.abs(wMusic - wCues) < 1, 'rail width identical on both tabs (' + wMusic + ' vs ' + wCues + ')');
  const wEditor = await page.evaluate(async () => {
    setRightTab('music');
    if (musicCues.length) { musicEditorOpenId = musicCues[0].id; renderMusicList(); }
    return document.getElementById('rightCol').getBoundingClientRect().width;
  });
  check(Math.abs(wEditor - wCues) < 1, 'open music editor does not widen the rail');


  console.log(fail ? 'UI TESTS FAILED' : 'ALL UI TESTS PASSED');
  await browser.close();
  process.exit(fail);
})().catch(e => { console.error(e); process.exit(1); });
