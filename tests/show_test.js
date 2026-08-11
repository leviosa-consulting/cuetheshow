const puppeteer = require('puppeteer-core');
const ROOT = require('path').resolve(__dirname, '..');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--allow-file-access-from-files', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });
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

  // Default show exists
  check(await page.$$eval('.showCard', els => els.length === 2 && els[0].textContent.includes('My show') && els[0].textContent.includes('0 subtitle cues') && els[1].textContent.includes('New show')), 'default show card + new-show card');

  // Show 1: script + audio
  await page.$eval('#pasteBox', el => { el.value = 'Alpha line one. Alpha line two.'; });
  await page.$eval('#pasteBtn', el => el.click());
  await page.waitForSelector('#console.active');
  const mfi = await page.$('#musicFileInput');
  await mfi.uploadFile(__dirname + '/themeA.wav');
  await sleep(700);
  check(await page.$eval('#showLabel', el => el.textContent.includes('My show')), 'top bar names the show');

  // New show → empty slate
  await page.evaluate(() => newShow('Second show'));
  await sleep(600);
  check(await page.$eval('#loadScreen', el => getComputedStyle(el).display !== 'none'), 'new show starts on empty load screen');
  check(await page.$$eval('.showCard', els => {
    const two = els.find(e => e.textContent.includes('Second show'));
    return two && two.classList.contains('cur');
  }), 'new show card is highlighted current');
  await page.$eval('#pasteBox', el => { el.value = 'Beta line here tonight.'; });
  await page.$eval('#pasteBtn', el => el.click());
  await page.waitForSelector('#console.active');
  const mfi2 = await page.$('#musicFileInput');
  await mfi2.uploadFile(__dirname + '/themeB.wav');
  await sleep(700);
  check(await page.$$eval('.mcueRow', els => els.length === 1 && els[0].textContent.includes('themeB')), 'show 2 has only its own music');

  // Card gallery: open the load screen, switch shows by clicking a card
  await page.click('#newPdfBtn');
  await page.waitForSelector('#showCards');
  await sleep(300);
  check(await page.$$eval('.showCard', els => els.length === 3), 'cards: one per show + new-show card');
  check(await page.$$eval('.showCard', els => {
    const two = els.find(e => e.textContent.includes('Second show'));
    return two && two.classList.contains('cur') &&
           two.textContent.includes('1 subtitle cue') && two.textContent.includes('1 music cue');
  }), 'cards: current highlight and cue counts');
  await page.$$eval('.showCard', els => els.find(e => e.textContent.includes('My show')).click());
  await sleep(800);
  check(await page.$eval('#console', el => el.classList.contains('active')), 'clicking a card opens that show');
  check(await page.$$eval('.cueItem', els => els.length === 2 && els[0].textContent.includes('Alpha')), 'show 1 script restored');
  check(await page.$$eval('.mcueRow', els => els.length === 1 && els[0].textContent.includes('themeA')), 'show 1 music restored');
  check(await page.$$eval('.mcueRow .badge.warn', els => els.length === 0), 'show 1 audio still attached');
  await page.evaluate(() => setRightTab('music'));
  await page.keyboard.press('Enter');
  await sleep(700);
  if (!(await page.evaluate(() => players.length))) await sleep(900);
  check(await page.evaluate(() => players.length === 1 && players[0].a.currentTime > 0.1), 'show 1 audio plays after switch');
  await page.keyboard.press('x'); await page.keyboard.press('x');
  await sleep(200);

  // Switch to show 2 again
  await page.evaluate(() => switchShow(2));
  await sleep(800);
  check(await page.$$eval('.cueItem', els => els.length === 1 && els[0].textContent.includes('Beta')), 'show 2 script restored');
  check(await page.$$eval('.mcueRow', els => els[0].textContent.includes('themeB')), 'show 2 music restored');

  // Rename
  await page.evaluate(() => renameShow('Renamed Two'));
  await sleep(200);
  check(await page.evaluate(() => showReg.list.find(s => s.id === showId).name === 'Renamed Two'), 'rename stored in registry');
  check(await page.$eval('#showLabel', el => el.textContent.includes('Renamed Two')), 'rename reflected in top bar');

  // Delete show 2 → lands on show 1; show 2 audio gone from store
  await page.evaluate(() => { deleteShowById(showId); });
  await modalOk();
  await sleep(800);
  check(await page.evaluate(() => showReg.list.length === 1 && currentShowName() === 'My show'), 'delete returns to remaining show');
  check(await page.$$eval('.cueItem', els => els.length === 2 && els[0].textContent.includes('Alpha')), 'remaining show intact after delete');
  check(await page.evaluate(async () => {
    const keys = await audioKeys();
    return keys.every(k => String(k).startsWith('s1a')) && keys.length === 1;
  }), 'deleted show audio removed, kept show audio remains');

  // Reload: current show + selector persist
  await page.reload();
  await page.waitForSelector('#console.active');
  await sleep(500);
  check(await page.$eval('#showLabel', el => el.textContent.includes('My show')), 'current show persists across reload');

  // Legacy migration: seed old-style keys, wipe registry, reload
  await page.waitForFunction('window.appReady');
  await page.evaluate(async () => {
    localStorage.clear(); localStorage.setItem('subtitleTool.mode', 'full');
    await new Promise(res => { const r = indexedDB.deleteDatabase('subtitleConsoleAudio'); r.onsuccess = r.onerror = r.onblocked = res; });
    localStorage.setItem('subtitleTool.cues', JSON.stringify([{ text: 'Legacy line.', sent: 0, start: true, end: true }]));
    localStorage.setItem('subtitleTool.name', 'Legacy Play');
    localStorage.setItem('subtitleTool.index', '-1');
    localStorage.setItem('subtitleTool.music', JSON.stringify({ cues: [{ id: 1, name: 'oldtrack', fileName: 'oldtrack.wav', group: 'A', volume: 1, fadeIn: 0, fadeOut: 2, loop: false, startAt: 0, endAt: null, followMode: 'none', followDelay: 3, linkCue: null, linkMode: 'auto', duck: null, duration: null }], standby: 0, master: 1, uid: 2 }));
    // legacy audio blob under old key 'a1'
    const db = await new Promise((res, rej) => { const r = indexedDB.open('subtitleConsoleAudio', 1); r.onupgradeneeded = () => r.result.createObjectStore('audio'); r.onsuccess = () => res(r.result); r.onerror = rej; });
    await new Promise((res, rej) => { const tx = db.transaction('audio', 'readwrite'); tx.objectStore('audio').put(new Blob(['x'], { type: 'audio/wav' }), 'a1'); tx.oncomplete = res; tx.onerror = rej; });
  });
  await page.reload();
  await page.waitForSelector('#console.active');
  await sleep(600);
  check(await page.evaluate(() => currentShowName() === 'Legacy Play'), 'legacy data migrates into a named show');
  check(await page.$$eval('.cueItem', els => els.length === 1 && els[0].textContent.includes('Legacy line')), 'legacy cues survive migration');
  check(await page.evaluate(async () => {
    const keys = await audioKeys();
    return keys.length === 1 && String(keys[0]) === 's1a1';
  }), 'legacy audio renamed to per-show key');
  check(await page.$$eval('.mcueRow .badge.warn', els => els.length === 0), 'migrated music cue still has audio');

  // --- Show bundle: export from card, wipe, import, everything back ---
  const fs = require('fs');
  const bundlePath = __dirname + '/Legacy-Play.cueshow.zip';
  try { fs.unlinkSync(bundlePath); } catch (e) {}
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: __dirname, eventsEnabled: true });
  await page.click('#showsBtn');
  await page.waitForSelector('#showCards');
  await sleep(300);
  await page.$$eval('.showCard.cur .cmenuBtn', els => els[0].click());
  await sleep(150);
  await page.$$eval('#cardMenu button', els => els.find(b => b.textContent.includes('Export show file')).click());
  for (let i = 0; i < 50 && !fs.existsSync(bundlePath); i++) await sleep(100);
  check(fs.existsSync(bundlePath), 'card ⇩ downloads a bundle');
  check(fs.readFileSync(bundlePath).slice(0, 2).toString() === 'PK', 'bundle is a real zip');

  await page.waitForFunction('window.appReady');
  await page.evaluate(async () => {
    localStorage.clear(); localStorage.setItem('subtitleTool.mode', 'full');
    await new Promise(res => { const r = indexedDB.deleteDatabase('subtitleConsoleAudio'); r.onsuccess = r.onerror = r.onblocked = res; });
  });
  await page.reload();
  await page.waitForSelector('#pasteBox');
  const bfi = await page.$('#fileInput');
  await bfi.uploadFile(bundlePath);
  await page.waitForSelector('#console.active', { timeout: 15000 });
  await sleep(600);
  check(await page.$eval('#showLabel', el => el.textContent.includes('Legacy Play')), 'bundle import recreates the show');
  check(await page.$$eval('.cueItem', els => els.length === 1 && els[0].textContent.includes('Legacy line')), 'bundle restores script cues');
  check(await page.$$eval('.mcueRow', els => els.length === 1 && els[0].textContent.includes('oldtrack')), 'bundle restores music cues');
  check(await page.$$eval('.mcueRow .badge.warn', els => els.length === 0), 'bundle restores audio too');

  // --- Freeze/lock: a locked show runs but cannot change ---
  await page.click('#showsBtn');
  await page.waitForSelector('#showCards');
  await sleep(300);
  await page.$$eval('.showCard.cur .cmenuBtn', els => els[0].click());
  await sleep(150);
  await page.$$eval('#cardMenu button', els => els.find(b => b.textContent.includes('Lock show')).click());
  await sleep(250);
  check(await page.evaluate(() => document.body.classList.contains('show-locked')), 'lock freezes the show');
  check(await page.$eval('#showLabel', el => el.textContent.includes('🔒')), 'top bar shows the padlock');
  await page.$$eval('.showCard', els => els.find(e => e.classList.contains('cur')).click());
  await sleep(400);
  check(await page.$eval('#musicAddRow', el => getComputedStyle(el).display === 'none'), 'locked: add-tracks hidden');
  check(await page.$$eval('.mcueRow button', els => els.every(b => getComputedStyle(b).display === 'none')), 'locked: music cue buttons hidden');
  await page.evaluate(() => setRightTab('cues'));
  const beforeN = await page.$$eval('.cueItem', els => els.length);
  await page.keyboard.press('n');
  await sleep(300);
  check(await page.$$eval('.cueItem', els => els.length) === beforeN, 'locked: N cannot insert a cue');
  check(await page.evaluate(async () => {
    const n = showReg.list.length;
    await deleteShowById(showId);
    return showReg.list.length === n;
  }), 'locked: show cannot be deleted');
  await page.click('#showsBtn');
  await sleep(300);
  await page.$$eval('.showCard.cur .cmenuBtn', els => els[0].click());
  await sleep(150);
  await page.$$eval('#cardMenu button', els => els.find(b => b.textContent.includes('Unlock show')).click());
  await sleep(250);
  check(await page.evaluate(() => !document.body.classList.contains('show-locked')), 'unlock restores editing');

  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(fail ? 'SHOW TESTS FAILED' : 'ALL SHOW TESTS PASSED');
  await browser.close();
  process.exit(fail);
})().catch(e => { console.error(e); process.exit(1); });
