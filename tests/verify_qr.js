const puppeteer = require('puppeteer-core');
const ROOT = require('path').resolve(__dirname, '..');
const jsQR = require('jsqr');
const { PNG } = require('pngjs');
const fs = require('fs');
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('file://' + ROOT + '/docs/ticket.html');
  await new Promise(r => setTimeout(r, 300));
  await page.$eval('details', d => { d.open = true; });
  await new Promise(r => setTimeout(r, 200));
  const qr = await page.$('.qrWrap');
  await qr.screenshot({ path: 'qr_live.png' });
  await page.screenshot({ path: 'shot_coffee_final.png' });
  // Copy button round-trip
  const ctx = browser.defaultBrowserContext();
  await ctx.overridePermissions('file://', ['clipboard-read', 'clipboard-write']).catch(() => {});
  await page.click('#copyBtn');
  await new Promise(r => setTimeout(r, 300));
  const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '(clipboard blocked on file://)');
  await browser.close();
  const png = PNG.sync.read(fs.readFileSync('qr_live.png'));
  const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  console.log('QR decodes to:', code ? code.data : 'DECODE FAILED');
  console.log('Copy button copied:', copied);
})().catch(e => { console.error(e.message); process.exit(1); });
