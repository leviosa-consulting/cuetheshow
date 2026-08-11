const puppeteer = require('puppeteer-core');
const ROOT = require('path').resolve(__dirname, '..');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--allow-file-access-from-files', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('console', msg => console.log('[console]', msg.text()));
  page.on('pageerror', err => console.log('[pageerror]', err.message));

  const dir = __dirname;
  await page.goto(`file://${ROOT}/subtitle-console.html?test=file://${dir}/test.pdf`);
  await page.waitForSelector('#testout', { timeout: 30000 });
  const result = JSON.parse(await page.$eval('#testout', el => el.textContent));

  if (result.error) { console.log('PIPELINE ERROR:', result.error); process.exit(1); }
  console.log('sentences:', result.sentenceCount, '| cues:', result.cues.length);
  for (const c of result.cues)
    console.log(`  [s${c.sent}${c.start ? ' start' : ''}${c.end ? ' end' : ''}] ${c.text}`);

  // Checks
  let fail = 0;
  const all = result.cues.map(c => c.text).join(' ');
  if (!all.includes('overhead')) { console.log('FAIL: de-hyphenation (overhead)'); fail = 1; }
  if (/\b7\b/.test(all)) { console.log('FAIL: page number leaked in'); fail = 1; }
  if (!all.includes('Dr. Aslam')) { console.log('FAIL: Dr. abbreviation'); fail = 1; }
  const counts = result.cues.map(c => c.text.split(' ').length);
  if (Math.max(...counts) > 12) { console.log('FAIL: cue over 12 words'); fail = 1; }
  let prevEnd = true;
  for (const c of result.cues) {
    if (prevEnd && !c.start) { console.log('FAIL: sentence rule broken'); fail = 1; }
    prevEnd = c.end;
  }
  // PDF italics -> *markers*
  await page.goto(`file://${ROOT}/subtitle-console.html?test=file://${dir}/test_italic.pdf`);
  await page.waitForSelector('#testout', { timeout: 30000 });
  const r2 = JSON.parse(await page.$eval('#testout', el => el.textContent));
  const joined2 = (r2.cues || []).map(c => c.text).join(' ');
  if (!joined2.includes('*dharma itself*')) { console.log('FAIL: PDF italics not captured:', joined2); fail = 1; }
  else console.log('ok   PDF italics captured: ' + joined2);

  console.log(fail ? 'E2E FAILED' : 'E2E PIPELINE PASSED');
  await browser.close();
  process.exit(fail);
})().catch(e => { console.error(e); process.exit(1); });
