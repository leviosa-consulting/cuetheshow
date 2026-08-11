const fs = require('fs');
const ROOT = require('path').resolve(__dirname, '..');
const html = fs.readFileSync(ROOT + '/subtitle-console.html', 'utf8');
const m = html.match(/\/\*CHUNK_START\*\/([\s\S]*?)\/\*CHUNK_END\*\//);
if (!m) { console.error('chunk code not found'); process.exit(1); }
eval(m[1]);

// --- Test 1: long text — avg near 8, max 12 ---
const text = "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of light, it was the season of darkness, it was the spring of hope, it was the winter of despair. We had everything before us, we had nothing before us, we were all going direct to Heaven, we were all going direct the other way. Dr. Manette arrived late. In short, the period was so far like the present period, that some of its noisiest authorities insisted on its being received, for good or for evil, in the superlative degree of comparison only. Silence fell.";
const { cues, sentenceCount } = chunkText(text);
let fail = 0;
const counts = cues.map(c => c.text.split(' ').length);
const avg = counts.reduce((a,b)=>a+b,0)/counts.length;
console.log('cues:', cues.length, 'sentences:', sentenceCount, 'avg words:', avg.toFixed(2), 'max:', Math.max(...counts));
if (Math.max(...counts) > 12) { console.error('FAIL: cue over 12 words'); fail=1; }
if (avg < 5 || avg > 10) { console.error('FAIL: avg out of range'); fail=1; }
if (sentenceCount !== 5) { console.error('FAIL: expected 5 sentences (Dr. must not split), got', sentenceCount); fail=1; }

// Sentence purity: cue sequence must be start...end per sentence, no mixing
let prevEnd = true, prevSent = -1;
for (const c of cues) {
  if (prevEnd && !c.start) { console.error('FAIL: cue after sentence end is not a sentence start'); fail=1; }
  if (!prevEnd && c.sent !== prevSent) { console.error('FAIL: sentence changed without end'); fail=1; }
  prevEnd = c.end; prevSent = c.sent;
}

// --- Test 2: reconstruction — no words lost ---
const rebuilt = cues.map(c=>c.text).join(' ');
if (rebuilt !== text.replace(/\s+/g,' ').trim()) { console.error('FAIL: text lost in chunking'); fail=1; }

// --- Test 3: short sentences stay whole ---
const r3 = chunkText("Hello there. This one has exactly twelve words in it right here now yes.");
if (r3.cues.length !== 2) { console.error('FAIL: 12-word sentence should be a single cue, got', JSON.stringify(r3.cues)); fail=1; }

// --- Test 4: assembleText de-hyphenation + page numbers ---
const asm = assembleText(["The moon rises over the moun-", "tains tonight.", "42", "", "A new page begins."]);
if (asm !== "The moon rises over the mountains tonight. A new page begins.") { console.error('FAIL: assembleText:', JSON.stringify(asm)); fail=1; }

// --- Test 5: quotes/questions ---
const r5 = chunkText('"Where are you going?" she asked. He said nothing at all.');
console.log('quote test sentences:', r5.cues.filter(c=>c.start).length);

// --- Test 6: stage directions in [] and () removed ---
const r6 = chunkText("The hall falls silent. [The lights dim slowly, and the crowd holds its breath.] A voice rises (from the dark (deep below)) and calls his name. (Pause.) He answers at once.");
const joined6 = r6.cues.map(c=>c.text).join(' ');
if (/[\[\]()]/.test(joined6)) { console.error('FAIL: brackets leaked:', joined6); fail=1; }
if (r6.sentenceCount !== 3) { console.error('FAIL: expected 3 sentences after stripping, got', r6.sentenceCount, joined6); fail=1; }
if (!joined6.includes('A voice rises and calls his name.')) { console.error('FAIL: mid-sentence strip wrong:', joined6); fail=1; }

// --- Test 7: pasted text — every line break is a hard cue boundary ---
const r7 = chunkTextLines("The river runs cold,\nand the night is long\n\nShe waits by the shore. He watches from the hill,\nsilent as stone");
const t7 = r7.cues.map(c => c.text);
if (t7.length !== 5) { console.error('FAIL: expected 5 cues from lines, got', JSON.stringify(t7)); fail=1; }
if (t7[0] !== 'The river runs cold,' || !r7.cues[0].end) { console.error('FAIL: comma line must end its own cue'); fail=1; }
if (!r7.cues[1].start || t7[1] !== 'and the night is long') { console.error('FAIL: unpunctuated line must start fresh'); fail=1; }
let pe7 = true;
for (const c of r7.cues) { if (pe7 && !c.start) { console.error('FAIL: line rule broke screen rule'); fail=1; } pe7 = c.end; }

// long single line still chunks to <=12 within the line
const r8 = chunkTextLines("one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty");
const c8 = r8.cues.map(c => c.text.split(' ').length);
if (Math.max(...c8) > 12) { console.error('FAIL: long pasted line over 12 words'); fail=1; }
if (!r8.cues[r8.cues.length-1].end || !r8.cues[0].start) { console.error('FAIL: long line boundary flags'); fail=1; }

// --- Test 9: *emphasis* markers rebalance across chunk splits ---
const r9 = chunkText("one two three four *five six seven eight nine ten eleven twelve thirteen fourteen* fifteen sixteen seventeen eighteen nineteen twenty.");
for (const c of r9.cues) {
  const stars = (c.text.match(/\*/g) || []).length;
  if (stars % 2 !== 0) { console.error('FAIL: unbalanced emphasis in cue:', c.text); fail=1; }
}
if (r9.cues.length < 2) { console.error('FAIL: expected a split for rebalance test'); fail=1; }
if (!/\*five/.test(r9.cues.map(c=>c.text).join(' '))) { console.error('FAIL: emphasis lost'); fail=1; }

console.log(fail ? 'TESTS FAILED' : 'ALL CHUNK TESTS PASSED');
cues.slice(0,8).forEach(c => console.log(`  [s${c.sent}${c.start?' start':''}${c.end?' end':''}] ${c.text}`));
process.exit(fail);
