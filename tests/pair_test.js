const puppeteer = require('puppeteer-core');
const ROOT = require('path').resolve(__dirname, '..');
const { spawn } = require('child_process');
const http = require('http');

(async () => {
  const relay = spawn('node', [ROOT + '/relay/server.js'], {
    env: { ...process.env, PORT: '9377', NODE_PATH: __dirname + '/node_modules' }, stdio: 'ignore',
  });
  const web = spawn('python3', ['-m', 'http.server', '8378', '--directory', ROOT + '/docs'], { stdio: 'ignore' });
  const up = () => new Promise(res => { const rq = http.get('http://127.0.0.1:8378/', r => res(true)); rq.on('error', () => res(false)); });
  for (let i = 0; i < 40 && !(await up()); i++) await new Promise(r => setTimeout(r, 250));

  const URL_ = 'http://127.0.0.1:8378/console.html?relay=' + encodeURIComponent('ws://127.0.0.1:9377/ws');
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', args: ['--disable-gpu'],
  });
  let fail = 0;
  const check = (cond, name) => { console.log((cond ? 'ok  ' : 'FAIL') + ' ' + name); if (!cond) fail = 1; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // The projector machine
  const disp = await browser.newPage();
  disp.on('dialog', d => d.accept());
  await disp.goto(URL_ + '&display=1');
  await disp.waitForFunction('window.appReady');
  await disp.evaluate(() => showLoadScreen());
  await disp.waitForFunction(() => /^[A-Z2-9] [A-Z2-9] [A-Z2-9] [A-Z2-9]$/.test(document.querySelector('#displayWait .dcode').textContent));
  const code = await disp.$eval('#displayWait .dcode', el => el.textContent.replace(/\s/g, ''));
  check(code.length === 4, 'display shows a 4-letter code: ' + code);

  // The operator's phone
  const con = await browser.newPage();
  con.on('dialog', d => d.accept());
  await con.setViewport({ width: 390, height: 780, isMobile: true, hasTouch: true });
  await con.goto(URL_);
  await con.waitForFunction('window.appReady');
  await con.evaluate(() => { appMode = 'full'; applyMode(); });
  await con.$eval('#pasteBox', el => { el.value = 'The war begins tonight. It is a dance of death.'; });
  await con.$eval('#pasteBtn', el => el.click());
  await con.waitForSelector('#console.active');
  await con.evaluate(c => castConnect(c), code);
  await sleep(800);
  check(await con.$eval('#castBtn', el => el.textContent.includes('1 screen')), 'console reports a connected screen');
  check(await disp.$eval('#displayStage', el => el.classList.contains('paired')), 'display pairs and clears the code');

  // Cue flows to the display
  await con.keyboard.press('ArrowRight');
  await sleep(500);
  const shown = await disp.$eval('#displayText', el => el.textContent.replace(/\n/g, ' '));
  check(shown === 'The war begins tonight.', 'cue text arrives on the display: "' + shown + '"');

  // Styling flows
  await con.$eval('#colorCtl', el => { el.value = '#ffd700'; el.dispatchEvent(new Event('input')); });
  await sleep(400);
  check(await disp.$eval('#displayText', el => el.style.color) === 'rgb(255, 215, 0)', 'style changes arrive live');

  // Blank flows
  await con.keyboard.press('b');
  await sleep(400);
  check(await disp.$eval('#displayText', el => el.textContent === ''), 'blank empties the display');
  await con.keyboard.press('b');

  // Test card flows
  await con.evaluate(() => { appMode = 'full'; });
  await con.$eval('#testCardBtn', el => el.click());
  await sleep(400);
  check(await disp.$eval('#displayTC', el => el.style.display === 'block'), 'test card appears on the display');
  await con.$eval('#testCardBtn', el => el.click());

  // Display survives a connection drop (same code, keeps receiving)
  await disp.evaluate(() => dispWs.close());
  await sleep(3000);
  await con.keyboard.press('ArrowRight');
  await sleep(500);
  check(await disp.$eval('#displayText', el => el.textContent.replace(/\n/g, ' ') === 'It is a dance of death.'), 'display reconnects and keeps receiving');

  // Console survives a reload mid-show (cast auto-resumes)
  await con.reload();
  await con.waitForSelector('#console.active');
  await sleep(1200);
  await con.keyboard.press('ArrowLeft');
  await sleep(600);
  check(await disp.$eval('#displayText', el => el.textContent.replace(/\n/g, ' ') === 'The war begins tonight.'), 'console reload auto-resumes casting');

  console.log(fail ? 'PAIR TESTS FAILED' : 'ALL PAIR TESTS PASSED');
  await browser.close();
  relay.kill();
  web.kill();
  process.exit(fail);
})().catch(e => { console.error(e); process.exit(1); });
