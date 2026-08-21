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
  await mfi.uploadFile(__dirname + '/themeA.wav');
  await sleep(500);
  await mfi.uploadFile(__dirname + '/themeB.wav');
  await sleep(500);
  await mfi.uploadFile(__dirname + '/sfx-hit.wav');
  await sleep(500);
  check(await page.$$eval('.mcueRow', els => els.length === 3), 'three music cues created');
  check(await page.$eval('#musicStandbyLine', el => el.textContent.includes('themeA')), 'standby on first cue');
  check(await page.$$eval('.mcueRow .sum', els => els[0].textContent.includes('100%')), 'cue summary rendered');
  check(await page.$$eval('.mcueRow .num', els => els.length === 0), 'cue rows carry no index numbers');
  check(await page.$eval('.mcueRow button.mdel svg.binIcon', el => !!el), 'delete is a bin, not an ×');

  // GO fires first cue
  await page.keyboard.press('Enter');
  await sleep(900);
  if (!(await page.evaluate(() => players.length))) await sleep(1200);
  check(await page.$$eval('.playerRow', els => els.length === 1 && els[0].textContent.includes('themeA')), 'GO plays themeA');
  // Headless Chrome only advances a track's clock when the machine can really
  // output audio. When the audio device is asleep the clock sits still, which
  // says nothing about this app, so those few checks report as skipped.
  const audioAlive = await page.evaluate(() => players[0].a.currentTime > 0.2 && !players[0].a.paused);
  if (audioAlive) check(true, 'audio actually progressing');
  else console.log('SKIP audio actually progressing (no audio output on this machine)');
  check(await page.$eval('#musicStandbyLine', el => el.textContent.includes('themeB')), 'standby advanced');

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
    return Math.abs(playerLevel(p) - p.vol * 0.4) < 0.02;
  }), 'master volume applied live');
  await page.$eval('#masterCtl', el => { el.value = 0; el.dispatchEvent(new Event('input')); });
  await sleep(100);
  check(await page.evaluate(() => players.every(p => playerLevel(p) === 0)), 'master at 0 silences output');
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
  await page.evaluate(() => moveMusicCue(0, 1));
  await sleep(150);
  check(await page.$$eval('.mcueRow', els => els[1].textContent.includes('Opening Theme')), 'reorder moves cue down');

  // Drag-and-drop reorder: pointer-drag row 0 below row 2 via the grip
  const dndOrder = await page.evaluate(() => {
    const grip = document.querySelectorAll('#musicList .mcueRow')[0].querySelector('.grip');
    const target = document.querySelectorAll('#musicList .mcueRow')[2];
    const tr = target.getBoundingClientRect();
    const ev = (type, y) => new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: tr.left + 8, clientY: y });
    grip.dispatchEvent(ev('pointerdown', grip.getBoundingClientRect().top + 4));
    grip.dispatchEvent(ev('pointermove', tr.bottom - 2));
    grip.dispatchEvent(ev('pointerup', tr.bottom - 2));
    return musicCues.map(c => c.name).join('|');
  });
  check(await page.$$eval('.mcueRow', els => els[2].textContent.includes('⠿')), 'rows carry a drag grip');
  check(dndOrder === 'Opening Theme|sfx-hit|themeB', 'drag drop reorders the list (' + dndOrder + ')');
  await page.evaluate(() => moveMusicCueTo(2, 0));   // put themeB back on top
  await sleep(150);

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
  if (audioAlive) check(playable, 'restored audio is playable');
  else console.log('SKIP restored audio is playable (no audio output on this machine)');
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
  // A new batch of files sorts alphabetically regardless of picker order
  await page.evaluate(() => newShow('Sort check'));
  await new Promise(r => setTimeout(r, 600));
  const mfi3 = await page.$('#musicFileInput');
  await mfi3.uploadFile(__dirname + '/themeB.wav', __dirname + '/themeA.wav', __dirname + '/sfx-hit.wav');
  await new Promise(r => setTimeout(r, 900));
  check(await page.$$eval('.mcueRow', els =>
    els.length === 3 &&
    els[0].textContent.includes('sfx-hit') &&
    els[1].textContent.includes('themeA') &&
    els[2].textContent.includes('themeB')), 'added batch is sorted by filename');

  // Timed level changes: 100% -> 30% at 1s -> 80% at 3s
  await page.evaluate(() => newShow('Level plan'));
  await new Promise(r => setTimeout(r, 600));
  await page.evaluate(async () => {
    const sr = 8000, secs = 20, n = sr * secs;
    const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const ws = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
    ws(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); ws(8, 'WAVEfmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true);
    v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 8) * 8000, true);
    await addAudioFiles([new File([buf], 'bed.wav', { type: 'audio/wav' })]);
  });
  await new Promise(r => setTimeout(r, 700));
  await page.evaluate(() => {
    const c = musicCues[0];
    c.step1Vol = 0.3; c.step1At = 1; c.step2Vol = 0.8; c.step2At = 10;
    musicStandby = 0; saveMusic(); renderMusic();
    $('loadScreen').style.display = 'none';      // a fresh show opens on the
    $('console').classList.add('active');        // load screen; GO needs the console
  });
  check(await page.$$eval('.mcueRow .sum', els =>
    els[0].textContent.includes('then 30% at 1s') && els[0].textContent.includes('then 80% at 10s')),
    'level plan shows in the cue summary');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 400));
  check(await page.evaluate(() => players[0] && Math.abs(players[0].target - 1) < 0.01), 'starts at its own level');
  // Move the track to just past each point. The engine reads the track's own
  // position, so this exercises it without depending on the machine's audio
  // clock (headless output can stall when the audio device is asleep).
  // The points sit far apart on purpose: each change glides over 2 seconds,
  // and a track that is really playing would reach the next point mid-glide.
  await page.evaluate(() => { players[0].a.currentTime = 1.2; });
  const lvl1 = await page.waitForFunction(() => players[0] && Math.abs(players[0].vol - 0.3) < 0.05, { timeout: 6000 })
    .then(() => true).catch(() => false);
  check(lvl1, 'drops to the second level once past its time');
  await page.evaluate(() => { players[0].a.currentTime = 10.2; });
  const lvl2 = await page.waitForFunction(() => players[0] && Math.abs(players[0].vol - 0.8) < 0.05, { timeout: 8000 })
    .then(() => true).catch(() => false);
  check(lvl2, 'rises to the third level once past its time');
  await page.keyboard.press('x');
  await new Promise(r => setTimeout(r, 400));

  // Cue length on every row, and seeking a playing track
  await page.evaluate(() => newShow('Seek check'));
  await new Promise(r => setTimeout(r, 600));
  await page.evaluate(async () => {
    const sr = 8000, secs = 40, n = sr * secs;
    const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const ws = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
    ws(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); ws(8, 'WAVEfmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true);
    v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 8) * 8000, true);
    await addAudioFiles([new File([buf], 'long-bed.wav', { type: 'audio/wav' })]);
  });
  await new Promise(r => setTimeout(r, 900));
  check(await page.$eval('.mcueRow .mdur', el => el.textContent) === '0:40', 'cue row shows how long it runs');
  await page.evaluate(() => {
    musicStandby = 0; saveMusic(); renderMusic();
    appMode = 'music'; applyMode();     // the arrow keys seek only here
  });
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 700));
  const seeked = await page.evaluate(() => {
    const row = document.querySelector('.playerRow');
    const r = row.getBoundingClientRect();
    const ev = ty => new PointerEvent(ty, { bubbles: true, pointerId: 9, clientX: r.left + r.width * 0.6, clientY: r.top + r.height / 2 });
    row.dispatchEvent(ev('pointerdown'));
    row.dispatchEvent(ev('pointerup'));
    return players[0].a.currentTime;
  });
  check(Math.abs(seeked - 24) < 1.5, 'clicking a playing row seeks to that point (' + seeked.toFixed(1) + 's)');
  await page.keyboard.press('ArrowLeft');
  await new Promise(r => setTimeout(r, 200));
  const back = await page.evaluate(() => players[0].a.currentTime);
  check(back < seeked - 3, 'left arrow nudges the track back');
  await page.keyboard.press('ArrowRight');
  await new Promise(r => setTimeout(r, 200));
  check(await page.evaluate(() => players[0].a.currentTime) > back + 3, 'right arrow nudges it forward');

  // Paused: the big button resumes instead of running the next cue
  const standbyBefore = await page.evaluate(() => musicStandby);
  await page.keyboard.press('p');
  await new Promise(r => setTimeout(r, 250));
  check(await page.evaluate(() => players.every(p => p.paused)), 'P pauses the track');
  check(await page.$eval('#goLabel', el => el.textContent) === 'Continue', 'GO reads Continue while paused');
  check(await page.$eval('#pauseLabel', el => el.textContent) === 'Play', 'the pause button reads Play');
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 350));
  check(await page.evaluate(() => musicStandby) === standbyBefore, 'GO while paused does not fire the next cue');
  check(await page.evaluate(() => players.length === 1 && !players[0].paused), 'GO while paused resumes the track');
  check(await page.$eval('#goLabel', el => el.textContent) === 'GO', 'GO reads GO again once playing');
  await page.keyboard.press('x');
  await new Promise(r => setTimeout(r, 400));

  // Vertical volume strip + 50% dip (music mode)
  await page.evaluate(() => { appMode = 'music'; applyMode(); });
  await new Promise(r => setTimeout(r, 300));
  check(await page.$eval('#volStrip', el => getComputedStyle(el).display === 'flex'), 'volume strip appears in music mode');
  check(await page.$eval('#musicTransport .master', el => getComputedStyle(el).display === 'none'), 'horizontal Vol row hidden in music mode');
  const vsVal = await page.evaluate(() => {
    const tr = document.getElementById('vsTrack');
    const r = tr.getBoundingClientRect();
    const ev = ty => new PointerEvent(ty, { bubbles: true, pointerId: 2, clientY: r.top + r.height * 0.25, clientX: r.left + 4 });
    tr.dispatchEvent(ev('pointerdown'));
    tr.dispatchEvent(ev('pointerup'));
    return masterVol;
  });
  check(Math.abs(vsVal - 0.75) < 0.04, 'strip tap sets master volume (' + vsVal.toFixed(2) + ')');
  await page.click('#halfBtn');
  await new Promise(r => setTimeout(r, 900));
  const dipped = await page.evaluate(() => masterVol);
  check(Math.abs(dipped - vsVal / 2) < 0.04, 'dip button fades to half of current (' + dipped.toFixed(2) + ')');
  check(await page.$eval('#halfBtn', el => el.textContent) === '100%', 'dipped button offers 100%');
  await page.click('#halfBtn');
  await new Promise(r => setTimeout(r, 900));
  const restored = await page.evaluate(() => masterVol);
  check(Math.abs(restored - 1) < 0.01, 'second tap returns to full volume (' + restored.toFixed(2) + ')');
  check(await page.$eval('#halfBtn', el => el.textContent) === '50%', 'button reads 50% again');
  await page.evaluate(() => { appMode = 'full'; applyMode(); });
  await new Promise(r => setTimeout(r, 200));

  await page.screenshot({ path: 'shot_music.png' });
  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(fail ? 'MUSIC TESTS FAILED' : 'ALL MUSIC TESTS PASSED');
  await browser.close();
  process.exit(fail);
})().catch(e => { console.error(e); process.exit(1); });
