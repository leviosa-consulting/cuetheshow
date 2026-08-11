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
  let lastDialog = ''; page.on('dialog', d => { lastDialog = d.message(); d.accept(); });
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
  await page.evaluate(() => localStorage.clear());
  await page.$eval('#pasteBox', el => { el.value = 'Line one.\nLine two.\nLine three.'; });
  await page.$eval('#pasteBtn', el => el.click());
  await page.waitForSelector('#console.active');

  // Add three audio tracks
  const mfi = await page.$('#musicFileInput');
  await mfi.uploadFile(__dirname + '/themeA.wav', __dirname + '/themeB.wav', __dirname + '/sfx-hit.wav');
  await sleep(800);
  check(await page.$$eval('.mcueRow', els => els.length === 3), 'three music cues created');
  check(await page.$eval('#musicStandbyLine', el => el.textContent.includes('1. themeA')), 'standby on first cue');
  check(await page.$$eval('.mcueRow .sum', els => els[0].textContent.includes('100%')), 'cue summary rendered');

  // GO fires first cue
  await page.keyboard.press('Enter');
  await sleep(900);
  if (!(await page.evaluate(() => players.length))) await sleep(1200);
  check(await page.$$eval('.playerRow', els => els.length === 1 && els[0].textContent.includes('themeA')), 'GO plays themeA');
  check(await page.evaluate(() => players[0].a.currentTime > 0.2 && !players[0].a.paused), 'audio actually progressing');
  check(await page.$eval('#musicStandbyLine', el => el.textContent.includes('2. themeB')), 'standby advanced');

  // Crossfade: set themeA fadeOut short, fire themeB
  await page.evaluate(() => { musicCues[0].fadeOut = 0.3; saveMusic(); });
  await page.keyboard.press('Enter');
  await sleep(150);
  check(await page.evaluate(() =>
    players.length === 2 && players[0].target === 0 && players[1].cue.name === 'themeB'
  ), 'firing themeB fades themeA (same-group crossfade)');
  await sleep(600);
  check(await page.evaluate(() => players.length === 1 && players[0].cue.name === 'themeB'), 'faded player removed after fadeOut');

  // SFX stacks on top without touching music
  await page.$$eval('.mcueRow', els => els[2].click());       // standby -> sfx cue
  await page.evaluate(() => { musicCues[2].group = 'stack'; saveMusic(); renderMusic(); });
  await page.keyboard.press('Enter');
  await sleep(300);
  check(await page.evaluate(() =>
    players.length === 2 && players.some(p => p.cue.group === 'stack') &&
    players.find(p => p.cue.name === 'themeB').target > 0
  ), 'sfx stacks, music keeps playing');

  // Master volume scales output
  await page.$eval('#masterCtl', el => { el.value = 40; el.dispatchEvent(new Event('input')); });
  await sleep(100);
  check(await page.evaluate(() => {
    const p = players.find(x => x.cue.name === 'themeB');
    return Math.abs(p.a.volume - p.vol * 0.4) < 0.02;
  }), 'master volume applied live');
  await page.$eval('#masterCtl', el => { el.value = 100; el.dispatchEvent(new Event('input')); });

  // Pause / resume
  await page.keyboard.press('p');
  await sleep(200);
  check(await page.evaluate(() => players.every(p => p.a.paused)), 'P pauses everything');
  await page.keyboard.press('p');
  await sleep(200);
  check(await page.evaluate(() => players.every(p => !p.a.paused)), 'P resumes');

  // S fades music layer only
  await page.keyboard.press('s');
  await sleep(150);
  check(await page.evaluate(() =>
    players.find(p => p.cue.group !== 'stack').target === 0 &&
    players.find(p => p.cue.group === 'stack').target > 0
  ), 'S fades music layer, sfx unaffected');

  // Panic: fade all, double-press hard cut
  await page.keyboard.press('x');
  await page.keyboard.press('x');
  await sleep(300);
  check(await page.evaluate(() => players.length === 0), 'double X stops everything');

  // Trim + auto-follow chain: themeA plays 0.5..1.0s then auto-fires next after 0.4s
  await page.evaluate(() => {
    musicCues[0].startAt = 0.5; musicCues[0].endAt = 1.0;
    musicCues[0].followMode = 'delay'; musicCues[0].followDelay = 0.4;
    musicStandby = 0; saveMusic(); renderMusic();
  });
  await page.keyboard.press('Enter');
  await sleep(200);
  check(await page.evaluate(() => players.length && players[0].a.currentTime >= 0.45), 'start-trim honoured');
  await sleep(500);
  check(await page.evaluate(() => players.some(p => p.cue.name === 'themeB')), 'auto-follow fired next cue');
  await sleep(700);
  check(await page.evaluate(() => !players.some(p => p.cue.name === 'themeA')), 'end-trim stopped themeA');
  await page.keyboard.press('x'); await page.keyboard.press('x');
  await sleep(200);

  // Editor opens and edits persist
  await page.$$eval('.mcueRow button', els => els.filter(b => b.textContent === '✎')[0].click());
  await page.waitForSelector('.mEditor');
  check(await page.evaluate(() => {
    const labels = [...document.querySelectorAll('.mEditor > label')];
    const find = s => labels.find(l => l.textContent.includes(s));
    const sameRow = (a, b) => Math.abs(find(a).offsetTop - find(b).offsetTop) < 3;
    return sameRow('Start at', 'End at') &&
           sameRow('When THIS cue starts', 'after how many seconds') &&
           sameRow('Fade in', 'Fade out') &&
           sameRow('Group', 'Volume');
  }), 'editor fields pair up on their rows');
  const delayVis = () => page.evaluate(() => {
    const f = [...document.querySelectorAll('.mEditor > label')].find(l => l.textContent.includes('after how many seconds'));
    return getComputedStyle(f).visibility;
  });
  check(await delayVis() === 'visible', 'delay field visible for this delay-mode cue');
  await page.$$eval('.mEditor select', els => {
    const f = els.find(s => [...s.options].some(o => o.value === 'delay'));
    f.value = 'none'; f.dispatchEvent(new Event('change'));
  });
  check(await delayVis() === 'hidden', 'delay field hides for other modes');
  await page.$$eval('.mEditor select', els => {
    const f = els.find(s => [...s.options].some(o => o.value === 'delay'));
    f.value = 'delay'; f.dispatchEvent(new Event('change'));
  });
  check(await delayVis() === 'visible', 'delay field returns for after-a-delay');
  await page.evaluate(() => { appMode = 'music'; applyMode(); });
  await new Promise(r => setTimeout(r, 200));
  check(await page.$$eval('.mEditor .linkField', els => els.length === 3 && els.every(el => getComputedStyle(el).display === 'none')), 'link fields hidden in music-only mode');
  await page.evaluate(() => { appMode = 'full'; applyMode(); });
  await new Promise(r => setTimeout(r, 200));
  await page.$eval('.mEditor input[type=text]', el => {
    el.value = 'Opening Theme'; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change'));
  });
  await page.$$eval('.mEditor .mBtns button', els => els[0].click());
  await sleep(200);
  check(await page.$$eval('.mcueRow', els => els[0].textContent.includes('Opening Theme')), 'editor renames cue');

  // Reorder
  await page.$$eval('.mcueRow button', els => els.filter(b => b.textContent === '▼')[0].click());
  await sleep(150);
  check(await page.$$eval('.mcueRow', els => els[1].textContent.includes('Opening Theme')), 'reorder moves cue down');

  // Music delete is undoable, audio survives
  await page.$$eval('.mcueRow button.mdel', els => els[0].click());
  await modalOk();
  await new Promise(r => setTimeout(r, 200));
  check((await page.$$('.mcueRow')).length === 2, 'music delete removes cue');
  check(lastDialog.includes('Delete music cue') && lastDialog.includes('audio'), 'music delete asked for confirmation');
  await page.$eval('#toast button', el => el.click());
  await new Promise(r => setTimeout(r, 300));
  check((await page.$$('.mcueRow')).length === 3, 'undo restores music cue');
  check(await page.$$eval('.mcueRow .badge.warn', els => els.length === 0), 'restored music cue still has its audio');

  // Persistence across reload (cue list + audio from IndexedDB)
  await page.reload();
  await page.waitForSelector('#console.active');
  await sleep(600);
  check(await page.$$eval('.mcueRow', els => els.length === 3 && !els.some(e => e.textContent.includes('no audio'))), 'music cues + audio survive reload');
  await page.evaluate(() => { musicStandby = 0; saveMusic(); renderMusic(); });  // themeB: no trims/follows
  await page.keyboard.press('Enter');
  const playable = await page.waitForFunction(
    () => players.length === 1 && players[0].cue.name === 'themeB' && players[0].a.currentTime > 0.1,
    { timeout: 5000 }).then(() => true).catch(() => false);
  check(playable, 'restored audio is playable');
  await page.keyboard.press('x'); await page.keyboard.press('x');

  // Legacy .cues.json import still works: flags missing audio, re-match by filename
  const fs = require('fs');
  const dl = __dirname + '/test.cues.json';
  fs.writeFileSync(dl, await page.evaluate(() => JSON.stringify({
    version: 2, name: 'test', cues, settings,
    music: { cues: musicCues.map(c => { const o = Object.assign({}, c); delete o.hasAudio; return o; }), standby: musicStandby, master: masterVol },
  })));
  check(JSON.parse(fs.readFileSync(dl, 'utf8')).music.cues.length === 3, 'legacy json carries music cues');
  await page.waitForFunction('window.appReady');
  await page.evaluate(async () => {
    localStorage.clear(); localStorage.setItem('subtitleTool.mode', 'full');
    await new Promise(res => { const r = indexedDB.deleteDatabase('subtitleConsoleAudio'); r.onsuccess = r.onerror = r.onblocked = res; });
  });
  await page.reload();
  await page.waitForSelector('#dropZone');
  const fi = await page.$('#fileInput');
  await fi.uploadFile(dl);
  await page.waitForSelector('#console.active');
  await sleep(600);
  check(await page.$$eval('.mcueRow .badge.warn', els => els.length === 3), 'import flags cues as missing audio');
  const mfi2 = await page.$('#musicFileInput');
  await mfi2.uploadFile(__dirname + '/themeA.wav');
  await sleep(600);
  check(await page.$$eval('.mcueRow .badge.warn', els => els.length === 2), 'dropped file re-matches by filename');

  // Screenshot
  await page.screenshot({ path: 'shot_music.png' });
  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(fail ? 'MUSIC TESTS FAILED' : 'ALL MUSIC TESTS PASSED');
  await browser.close();
  process.exit(fail);
})().catch(e => { console.error(e); process.exit(1); });
