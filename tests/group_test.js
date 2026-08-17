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
  await page.$eval('#pasteBox', el => { el.value = 'One. Two. Three.'; });
  await page.$eval('#pasteBtn', el => el.click());
  await page.waitForSelector('#console.active');
  const mfi = await page.$('#musicFileInput');
  // 4 cues: theme (A), rain bed (B), rain bed 2 (B), stinger (stack)
  await mfi.uploadFile(__dirname + '/themeA.wav');
  await sleep(500);
  await mfi.uploadFile(__dirname + '/themeB.wav');
  await sleep(500);
  await mfi.uploadFile(__dirname + '/sfx-hit.wav');
  await sleep(500);
  await mfi.uploadFile(__dirname + '/themeA.wav');
  await sleep(900);
  check(await page.evaluate(() => musicCues.length === 4), 'four cues loaded');
  await page.evaluate(() => {
    musicCues[1].group = 'B'; musicCues[2].group = 'B'; musicCues[3].group = 'stack';
    saveMusic(); renderMusic();
  });

  // GO x2: theme (A) + bed (B) both playing simultaneously at full target
  await page.keyboard.press('Enter');
  await sleep(300);
  await page.keyboard.press('Enter');
  await sleep(500);
  check(await page.evaluate(() =>
    players.length === 2 && players.every(p => p.target > 0) &&
    players.every(p => p.a.currentTime > 0.1)
  ), 'two beds (A + B) run simultaneously');

  // GO fires second B cue: only the B player crossfades, A untouched
  await page.keyboard.press('Enter');
  await sleep(300);
  check(await page.evaluate(() => {
    const a = players.find(p => p.cue.group === 'A');
    const bs = players.filter(p => p.cue.group === 'B');
    return a && a.target > 0 && bs.length === 2 &&
           bs.some(p => p.target === 0) && bs.some(p => p.target > 0);
  }), 'B cue crossfades only group B; A keeps playing');

  // GO fires stack cue: nothing fades
  await page.keyboard.press('Enter');
  await sleep(300);
  check(await page.evaluate(() =>
    players.filter(p => p.target > 0).length === 3 ||
    players.filter(p => p.target > 0).length === 2 + players.filter(p => p.cue.group === 'stack' && p.target > 0).length
  ), 'stack cue fades nothing');
  check(await page.evaluate(() => players.some(p => p.cue.group === 'stack' && p.target > 0)), 'stack cue is sounding');

  // S fades grouped beds, leaves stack
  await page.keyboard.press('s');
  await sleep(150);
  check(await page.evaluate(() =>
    players.filter(p => p.cue.group !== 'stack').every(p => p.target === 0) &&
    players.find(p => p.cue.group === 'stack').target > 0
  ), 'S fades all beds, stack survives');
  await page.keyboard.press('x'); await page.keyboard.press('x');
  await sleep(300);

  // 'with' follow: one GO launches two cues at once
  await page.evaluate(() => {
    musicCues[0].followMode = 'with';
    musicStandby = 0; saveMusic(); renderMusic();
  });
  await page.keyboard.press('Enter');
  await sleep(500);
  check(await page.evaluate(() =>
    players.length === 2 && players.every(p => p.target > 0) &&
    Math.abs(players[0].a.currentTime - players[1].a.currentTime) < 0.25
  ), "'with' fires two cues from one GO, in sync");
  check(await page.evaluate(() => musicStandby === 2), "'with' advances standby past both");
  await page.keyboard.press('x'); await page.keyboard.press('x');
  await sleep(200);

  // Migration: old-style layer cues get groups on load
  await page.evaluate(() => {
    const m = JSON.parse(localStorage.getItem(MUSIC_LS));
    m.cues.forEach(c => { delete c.group; });
    m.cues[0].layer = 'music'; m.cues[2].layer = 'sfx';
    localStorage.setItem(MUSIC_LS, JSON.stringify(m));
  });
  await page.reload();
  await page.waitForSelector('#console.active');
  await sleep(500);
  check(await page.evaluate(() =>
    musicCues[0].group === 'A' && musicCues[2].group === 'stack' && musicCues[1].group === 'A'
  ), 'legacy layer cues migrate to groups');

  // Ducking: A at 70%, B enters with duck-to-30%, A restores when B goes
  await page.keyboard.press('x'); await page.keyboard.press('x');
  await sleep(300);
  await page.evaluate(() => {
    musicCues[0].volume = 0.7; musicCues[0].group = 'A'; musicCues[0].followMode = 'none';
    musicCues[1].volume = 1;   musicCues[1].group = 'B'; musicCues[1].duck = 0.3; musicCues[1].followMode = 'none';
    musicStandby = 0; saveMusic(); renderMusic();
  });
  await page.keyboard.press('Enter');
  await sleep(400);
  check(await page.evaluate(() => {
    const a = players.find(p => p.cue.group === 'A');
    return a && Math.abs(a.target - 0.7) < 0.01;
  }), 'A plays at its own 70%');
  await page.keyboard.press('Enter');
  await sleep(1400);
  check(await page.evaluate(() => {
    const a = players.find(p => p.cue.group === 'A');
    return a && Math.abs(a.target - 0.3) < 0.01 && Math.abs(playerLevel(a) - 0.3) < 0.06;
  }), 'B entering ducks A to 30%');
  check(await page.evaluate(() => {
    const b = players.find(p => p.cue.group === 'B');
    return b && Math.abs(b.target - 1) < 0.01;
  }), 'B itself plays at full volume');
  await page.evaluate(() => {
    const b = players.find(p => p.cue.group === 'B');
    setFade(b, 0, 0.05);
  });
  await sleep(400);
  check(await page.evaluate(() => {
    const a = players.find(p => p.cue.group === 'A');
    return a && Math.abs(a.target - 0.7) < 0.01;
  }), 'A rises back to 70% when B goes');

  await page.screenshot({ path: 'shot_groups.png' });
  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(fail ? 'GROUP TESTS FAILED' : 'ALL GROUP TESTS PASSED');
  await browser.close();
  process.exit(fail);
})().catch(e => { console.error(e); process.exit(1); });
