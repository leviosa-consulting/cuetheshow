const puppeteer = require('puppeteer-core');
const ROOT = require('path').resolve(__dirname, '..');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--allow-file-access-from-files', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 780, isMobile: true, hasTouch: true });
  page.on('dialog', d => d.accept());
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

  // Real device-width rendering (not scaled 980px desktop)
  check(await page.evaluate(() => window.innerWidth <= 420), 'viewport meta gives true device width: ' + await page.evaluate(() => window.innerWidth));

  await page.$eval('#pasteBox', el => { el.value = 'Line one. Line two here. Line three closes it.'; });
  await page.$eval('#pasteBtn', el => el.click());
  await page.waitForSelector('#console.active');
  await sleep(300);

  check(await page.$eval('#main', el => getComputedStyle(el).flexDirection === 'column'), 'phone: single-column layout');
  check(await page.evaluate(() => {
    const r = document.getElementById('rightCol').getBoundingClientRect();
    return Math.abs(r.width - window.innerWidth) < 2;
  }), 'phone: rail spans full width');
  check(await page.$eval('#keysHint', el => getComputedStyle(el).display === 'none'), 'phone: keyboard legend hidden');
  check(await page.evaluate(() => {
    document.querySelector('#tabCues').click();
    const b = document.querySelector('.cueItem .del');
    return getComputedStyle(b).visibility === 'visible';
  }), 'touch: row buttons visible without hover');

  // Subtitle transport by touch
  await page.tap('#nextBtn');
  await sleep(250);
  check(await page.$eval('#cueCounter', el => el.textContent.startsWith('1 /')), 'tap Next advances subtitles');
  await page.evaluate(() => { setRightTab('cues'); document.getElementById('main').scrollTop = 0; });
  await page.tap('#nextBtn'); await page.tap('#nextBtn');
  await sleep(300);
  check(await page.$eval('#main', el => el.scrollTop === 0), 'advancing never scrolls the page away from the buttons');

  // Music by touch
  const mfi = await page.$('#musicFileInput');
  await mfi.uploadFile(__dirname + '/themeA.wav', __dirname + '/themeB.wav');
  await sleep(800);
  await page.evaluate(() => setRightTab('music'));
  await page.tap('#goBtn');
  await sleep(600);
  if (!(await page.evaluate(() => players.length))) await sleep(900);
  check(await page.evaluate(() => players.length === 1 && players[0].a.currentTime > 0.1), 'tap GO plays audio');
  check(await page.$$eval('.mcueRow .grip', els => els.length === 2 && els.every(g => getComputedStyle(g).display !== 'none')), 'touch: drag grips visible for reordering');
  check(await page.evaluate(() =>
    !('wakeLock' in navigator) || wakeLock !== null
  ), 'wake lock held while audio plays (or API absent)');
  await page.tap('#mPanicBtn'); await page.tap('#mPanicBtn');
  await sleep(400);
  check(await page.evaluate(() =>
    !('wakeLock' in navigator) || wakeLock === null
  ), 'wake lock released when silent');
  await page.screenshot({ path: 'shot_phone_full2.png' });

  // Music-only mode on phone
  await page.evaluate(() => { appMode = 'music'; applyMode(); });
  await sleep(300);
  check(await page.$eval('#leftCol', el => getComputedStyle(el).display === 'none'), 'phone music mode: pure soundboard');
  check(await page.evaluate(() => {
    const go = document.getElementById('goBtn').getBoundingClientRect();
    return go.width > 300 && go.height >= 55;
  }), 'phone music mode: GO is a big target');
  // Two-row cue cards: name line above the controls line, not truncated
  await page.evaluate(() => {
    musicCues[0].name = 'A very long opening night theme name';
    saveMusic(); renderMusic();
  });
  await sleep(200);
  check(await page.evaluate(() => {
    const row = document.querySelector('.mcueRow');
    const name = row.querySelector('.mname');
    const btn = row.querySelector('button');
    return name.getBoundingClientRect().bottom <= btn.getBoundingClientRect().top + 2;
  }), 'phone: cue name row sits above controls row');
  check(await page.evaluate(() => {
    const name = document.querySelector('.mcueRow .mname');
    return name.scrollWidth <= name.clientWidth + 1;
  }), 'phone: long cue name fully visible (no ellipsis)');
  check(await page.$('#exportBtn') === null, 'export lives on the show cards, not in SETUP');
  check(await page.$eval('#testCardBtn', el => getComputedStyle(el).display === 'none'), 'test card hidden in music-only mode');
  await page.tap('#helpBtn');
  await sleep(250);
  check(await page.$eval('#helpBox table', el => getComputedStyle(el).display === 'none'), 'help on touch: key table hidden');
  check(await page.$$eval('#helpBox .hkeys', els => els.every(e => getComputedStyle(e).display === 'none')), 'help on touch: key phrasing hidden');
  check(await page.$eval('#helpBox .htouch', el => getComputedStyle(el).display === 'inline'), 'help on touch: button phrasing shown');
  await page.tap('#helpClose');
  await sleep(200);

  // Script-intake screen must be fully reachable on a phone
  await page.evaluate(() => { appMode = 'full'; applyMode(); showLoadScreen(true); });
  await sleep(300);
  check(await page.evaluate(() => document.querySelector('h1').getBoundingClientRect().top >= 0), 'intake: title reachable (no clipped top)');
  check(await page.evaluate(() => {
    const ls = document.getElementById('loadScreen');
    ls.scrollTop = 999999;
    const last = document.querySelector('#loadScreen > :last-child').getBoundingClientRect();
    return last.bottom <= window.innerHeight + 4;
  }), 'intake: bottom reachable by scroll');
  await page.evaluate(() => { appMode = 'music'; applyMode(); });
  await page.screenshot({ path: 'shot_phone_music2.png' });

  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(fail ? 'MOBILE TESTS FAILED' : 'ALL MOBILE TESTS PASSED');
  await browser.close();
  process.exit(fail);
})().catch(e => { console.error(e); process.exit(1); });
