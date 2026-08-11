const puppeteer = require('puppeteer-core');
const ROOT = require('path').resolve(__dirname, '..');
const { spawn } = require('child_process');
const http = require('http');

(async () => {
  const server = spawn('python3', ['-m', 'http.server', '8377', '--directory', ROOT + '/docs'], { stdio: 'ignore' });
  const up = () => new Promise(res => { const rq = http.get('http://127.0.0.1:8377/', r => res(true)); rq.on('error', () => res(false)); });
  for (let i = 0; i < 40 && !(await up()); i++) await new Promise(r => setTimeout(r, 250));

  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', args: ['--disable-gpu'],
  });
  const page = await browser.newPage();
  page.on('dialog', d => d.accept());
  let errors = [];
  page.on('pageerror', err => errors.push(err.message));
  let fail = 0;
  const check = (cond, name) => { console.log((cond ? 'ok  ' : 'FAIL') + ' ' + name); if (!cond) fail = 1; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  await page.goto('http://127.0.0.1:8377/console.html');
  await page.waitForFunction('window.appReady');
  check(await page.evaluate(() => document.documentElement.outerHTML.length < 300000), 'hosted page is slim (~120 KB, not 1.5 MB)');
  check(await page.evaluate(() => typeof pdfjsLib === 'undefined'), 'PDF engine not loaded up front');
  check(await page.evaluate(() => document.body.classList.contains('mode-music')), 'fresh hosted visitor lands music-first');

  // switch to full console, load a PDF: engine arrives on demand
  await page.evaluate(() => { appMode = 'full'; applyMode(); });
  await sleep(200);
  const fi = await page.$('#fileInput');
  await fi.uploadFile(__dirname + '/test.pdf');
  await page.waitForSelector('#console.active', { timeout: 30000 });
  await sleep(400);
  check((await page.$$('.cueItem')).length === 8, 'PDF chunked to 8 cues via lazy-loaded engine');
  check(await page.evaluate(() => typeof pdfjsLib !== 'undefined'), 'engine present after on-demand load');

  // paste path never needs the engine
  await page.evaluate(() => showLoadScreen(true));
  await page.$eval('#pasteBox', el => { el.value = 'One line here.'; });
  await page.$eval('#pasteBtn', el => el.click());
  await page.waitForSelector('#console.active');
  check((await page.$$('.cueItem')).length === 1, 'paste path works hosted');

  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  // Landing page: fresh visitor sees it, console users skip it
  const fresh = await browser.newPage();
  await fresh.goto('http://127.0.0.1:8377/?welcome');
  await sleep(300);
  check(await fresh.$eval('h1', el => el.textContent.includes('music and subtitles')), 'landing hero renders at root');
  check(await fresh.$$eval('a[href="console.html"]', els => els.length >= 2), 'landing links to the console');
  await fresh.goto('http://127.0.0.1:8377/');
  await sleep(600);
  check(fresh.url().includes('console.html'), 'root forwards returning users to the console');
  await fresh.close();

  console.log(fail ? 'HOSTED TESTS FAILED' : 'ALL HOSTED TESTS PASSED');
  await browser.close();
  server.kill();
  process.exit(fail);
})().catch(e => { console.error(e); process.exit(1); });
