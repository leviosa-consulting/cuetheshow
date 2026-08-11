const puppeteer = require('puppeteer-core');
const ROOT = require('path').resolve(__dirname, '..');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', args: ['--allow-file-access-from-files', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('dialog', d => d.accept());
  let errors = 0;
  page.on('pageerror', err => { console.log('[pageerror]', err.message); errors++; });
  let fail = 0;
  const check = (cond, name) => { console.log((cond ? 'ok  ' : 'FAIL') + ' ' + name); if (!cond) fail = 1; };

  await page.goto('file://' + ROOT + '/subtitle-console-lite.html');
  await page.waitForSelector('#dropZone');
  await page.waitForFunction('window.appReady');
  await page.evaluate(() => localStorage.setItem('subtitleTool.mode', 'full'));
  await page.reload();
  await page.waitForSelector('#dropZone');
  check(await page.$eval('h1', el => el.textContent.includes('Lite')), 'lite branding shown');
  check(await page.$eval('#dropZone strong', el => el.textContent.includes('.cues.json')), 'drop zone asks for json');

  // PDF politely rejected
  const input = await page.$('#fileInput');
  await input.uploadFile(__dirname + '/test.pdf');
  await new Promise(r => setTimeout(r, 400));
  check(await page.$eval('#loadStatus', el => el.textContent.includes('no PDF engine')), 'PDF gets friendly lite-build error');

  // paste works, full pipeline
  await page.$eval('#pasteBox', el => {
    el.value = 'The hall falls silent. [The lights dim.] A voice rises (from the dark) and calls his name over the water and the waiting crowd below.\nThe *storm* breaks,';
  });
  await page.$eval('#pasteBtn', el => el.click());
  await page.waitForSelector('#console.active');
  await new Promise(r => setTimeout(r, 300));
  check((await page.$$('.cueItem')).length === 4, 'paste chunks correctly in lite');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await new Promise(r => setTimeout(r, 250));
  const pv = await page.$eval('#previewText', el => el.textContent);
  check(pv === 'A voice rises and calls\nhis name over the water', 'two-line stage display works in lite');

  // json import works
  await page.click('#newPdfBtn');
  await page.waitForSelector('#dropZone');
  const input2 = await page.$('#fileInput');
  require('fs').writeFileSync(__dirname + '/test.cues.json', await page.evaluate(() =>
    JSON.stringify({ version: 2, name: 'test', cues, settings, music: { cues: [], standby: 0, master: 1 } })));
  const expected = JSON.parse(require('fs').readFileSync(__dirname + '/test.cues.json', 'utf8')).cues.length;
  await input2.uploadFile(__dirname + '/test.cues.json');
  await page.waitForSelector('#console.active');
  await new Promise(r => setTimeout(r, 300));
  check((await page.$$('.cueItem')).length === expected, 'cues.json import works in lite');

  check(errors === 0, 'no page errors in lite build');
  await page.screenshot({ path: 'shot_lite.png' });
  console.log(fail ? 'LITE TESTS FAILED' : 'ALL LITE TESTS PASSED');
  await browser.close();
  process.exit(fail);
})().catch(e => { console.error(e); process.exit(1); });
