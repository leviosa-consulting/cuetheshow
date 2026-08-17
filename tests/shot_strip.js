const ROOT = require('path').resolve(__dirname, '..');
const puppeteer = require('puppeteer-core');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto('file://' + ROOT + '/subtitle-console.html');
  await page.waitForFunction(() => window.appReady);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('subtitleTool.mode', 'music'); });
  await page.reload();
  await page.waitForFunction(() => window.appReady);
  await sleep(300);
  await page.evaluate(() => document.body.classList.add('touch'));
  const mfi = await page.$('#musicFileInput');
  await mfi.uploadFile(
    __dirname + '/themeA.wav', __dirname + '/themeB.wav', __dirname + '/sfx-hit.wav',
    __dirname + '/themeA.wav', __dirname + '/themeB.wav');
  await sleep(1200);
  await page.evaluate(() => {
    const names = ['Preshow ambience', 'Act One opening', 'Storm', 'Interval music', 'Curtain call'];
    musicCues.forEach((c, i) => { c.name = names[i] || c.name; });
    saveMusic(); renderMusic();
  });
  await page.keyboard.press('Enter');
  await sleep(600);
  await page.screenshot({ path: 'shot_strip_phone.png' });
  await browser.close();
  console.log('done');
})().catch(e => { console.error(e.message); process.exit(1); });
