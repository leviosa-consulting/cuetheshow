const puppeteer = require('puppeteer-core');
const ROOT = require('path').resolve(__dirname, '..');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--allow-file-access-from-files', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1100 });
  page.on('dialog', d => d.accept());
  let lastDialog = '';
  const modalOk = async () => {
    await page.waitForSelector('#modal.on');
    lastDialog = await page.$eval('#modalMsg', el => el.textContent);
    await page.$eval('#modalOk', el => el.click());
  };

  let errors = [];
  page.on('pageerror', err => errors.push(err.message));
  let fail = 0;
  const check = (cond, name) => { console.log((cond ? 'ok  ' : 'FAIL') + ' ' + name); if (!cond) fail = 1; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  await page.goto('file://' + ROOT + '/subtitle-console.html');
  await page.waitForSelector('#pasteBox');
  await page.waitForFunction('window.appReady');
  await page.evaluate(async () => {
    localStorage.clear(); localStorage.setItem('subtitleTool.mode', 'full');
    await new Promise(res => { const r = indexedDB.deleteDatabase('subtitleConsoleAudio'); r.onsuccess = r.onerror = r.onblocked = res; });
  });
  await page.reload();
  await page.waitForSelector('#pasteBox');
  await page.$eval('#pasteBox', el => { el.value = 'Line one.\nLine two.\nLine three.\nLine four.'; });
  await page.$eval('#pasteBtn', el => el.click());
  await page.waitForSelector('#console.active');
  const mfi = await page.$('#musicFileInput');
  await mfi.uploadFile(__dirname + '/themeA.wav', __dirname + '/themeB.wav');
  await sleep(800);

  // Link via the editor UI: themeA -> subtitle #2 auto
  await page.$$eval('.mcueRow button', els => els.filter(b => b.textContent === '✎')[0].click());
  await page.waitForSelector('.mEditor');
  await page.$$eval('.mEditor input[type=number]', els => {
    const link = els[els.length - 1];   // last number field = link #
    link.value = 2; link.dispatchEvent(new Event('input')); link.dispatchEvent(new Event('change'));
  });
  check(await page.$eval('.mEditor .mWide:last-of-type span', el => el.textContent.includes('Line two')), 'editor shows linked line snippet');
  await page.$$eval('.mEditor .mBtns button', els => els[0].click());
  await sleep(200);
  // themeB -> subtitle #3 remind (set directly, editor path already exercised)
  await page.evaluate(() => {
    musicCues[1].linkCue = 2; musicCues[1].linkMode = 'remind';
    saveMusic(); renderMusic(); buildCueList(); renderAll();
  });
  await sleep(200);

  check(await page.$$eval('.cueItem .mlink', els => els.length === 2), 'subtitle list shows ♪ on linked lines');
  check(await page.$$eval('.mcueRow .sum', els => els[0].textContent.includes('♪ line 2 auto')), 'music summary shows link');

  // Forward step onto line 1: nothing fires
  await page.keyboard.press('ArrowRight');
  await sleep(400);
  check(await page.evaluate(() => players.length === 0), 'no trigger on unlinked line');

  // Forward step onto line 2: themeA auto-fires
  await page.keyboard.press('ArrowRight');
  await sleep(600);
  check(await page.evaluate(() => players.length === 1 && players[0].cue.name === 'themeA'), 'auto link fires on its line');
  check(await page.evaluate(() => musicStandby === 1), 'standby moved past auto-fired cue');

  // Forward step onto line 3: themeB reminder (no fire), alert visible, standby armed
  await page.keyboard.press('ArrowRight');
  await sleep(400);
  check(await page.evaluate(() => players.length === 1), 'remind mode does not fire');
  check(await page.$eval('#musicAlert', el => el.classList.contains('on') && el.textContent.includes('themeB')), 'reminder alert shows with cue name');
  check(await page.evaluate(() => musicStandby === 1), 'reminder arms cue as standby');

  // Enter plays it, alert clears, themeA crossfades out (both music layer)
  await page.keyboard.press('Enter');
  await sleep(500);
  check(await page.evaluate(() => players.some(p => p.cue.name === 'themeB')), 'Enter fires reminded cue');
  check(await page.$eval('#musicAlert', el => !el.classList.contains('on')), 'alert clears when cue fires');

  // Backtrack + step forward again: themeB still playing -> no double fire
  await page.keyboard.press('ArrowLeft');
  await sleep(200);
  await page.keyboard.press('ArrowRight');
  await sleep(400);
  check(await page.evaluate(() => players.filter(p => p.cue.name === 'themeB').length === 1), 'no double-fire while cue already playing');

  // Jump (not a single step) onto a linked line: silent
  await page.keyboard.press('x'); await page.keyboard.press('x');
  await sleep(300);
  await page.evaluate(() => goTo(-1));
  await page.$$eval('.cueItem', els => els[1].click());   // jump -1 -> 1 (step of 2)
  await sleep(400);
  check(await page.evaluate(() => players.length === 0), 'jumps do not trigger links');

  // Insert/delete adjust link indices (needs the Cues tab visible for the editor)
  await page.click('#tabCues');
  await page.evaluate(() => insertCue(0));
  await page.keyboard.press('Escape');   // abandon empty -> net zero
  await sleep(200);
  check(await page.evaluate(() => musicCues[0].linkCue === 1), 'link survives abandoned insert unchanged');
  await page.evaluate(() => { cues.splice(0, 0, { text: 'Inserted', sent: -1, start: true, end: true }); }); // silence direct model tweak
  await page.evaluate(() => { cues.splice(0, 1); });  // undo
  await page.evaluate(() => insertCue(0));
  await page.waitForSelector('.cueItem textarea');
  await page.keyboard.type('New line');
  await page.keyboard.press('Enter');
  await sleep(200);
  check(await page.evaluate(() => musicCues[0].linkCue === 2 && musicCues[1].linkCue === 3), 'insert before link shifts indices');
  await page.$$eval('.cueItem .del', els => els[1].click());
  await modalOk();
  await sleep(200);
  check(await page.evaluate(() => musicCues[0].linkCue === 1 && musicCues[1].linkCue === 2), 'delete before link shifts back');
  await page.$$eval('.cueItem .del', els => els[1].click());  // delete the linked line itself
  await modalOk();
  await sleep(200);
  check(await page.evaluate(() => musicCues[0].linkCue === null), 'deleting the linked line clears the link');

  await page.screenshot({ path: 'shot_links.png' });
  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(fail ? 'LINK TESTS FAILED' : 'ALL LINK TESTS PASSED');
  await browser.close();
  process.exit(fail);
})().catch(e => { console.error(e); process.exit(1); });
