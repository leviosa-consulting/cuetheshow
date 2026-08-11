const puppeteer = require('puppeteer-core');
const ROOT = require('path').resolve(__dirname, '..');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--allow-file-access-from-files', '--disable-gpu'],
  });
  const page = await browser.newPage();
  page.on('pageerror', err => console.log('[pageerror]', err.message));
  const pdf = encodeURIComponent('file://' + ROOT + '/Ardharathi - English translation.pdf');
  await page.goto('file://' + ROOT + '/subtitle-console.html?test=' + pdf);
  await page.waitForSelector('#testout', { timeout: 60000 });
  const r = JSON.parse(await page.$eval('#testout', el => el.textContent));
  if (r.error) { console.log('ERROR:', r.error); process.exit(1); }
  const counts = r.cues.map(c => c.text.split(' ').length);
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  console.log('sentences:', r.sentenceCount, '| cues:', r.cues.length,
              '| avg words:', avg.toFixed(2), '| max:', Math.max(...counts));
  let prevEnd = true, viol = 0;
  for (const c of r.cues) { if (prevEnd && !c.start) viol++; prevEnd = c.end; }
  console.log('sentence-rule violations:', viol, '| cues over 12 words:', counts.filter(n => n > 12).length);
  console.log('--- first 12 cues ---');
  r.cues.slice(0, 12).forEach((c, i) => console.log(`${String(i+1).padStart(3)} ${c.start ? '' : '↳ '}${c.text}`));
  console.log('--- middle 6 cues ---');
  const mid = Math.floor(r.cues.length / 2);
  r.cues.slice(mid, mid + 6).forEach((c, i) => console.log(`${String(mid+i+1).padStart(3)} ${c.start ? '' : '↳ '}${c.text}`));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
