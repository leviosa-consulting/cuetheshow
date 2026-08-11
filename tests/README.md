# CueTheShow tests

Puppeteer suites that drive the real app in headless Chrome (expects Chrome at
/Applications/Google Chrome.app). Setup once: `npm install` in this folder.

Run any suite with `node <name>_test.js`. The main battery: chunk, ui, music,
group, link, show, lite, mobile, hosted, pair, e2e. Each prints ok/FAIL per
check and a final verdict line.

`real_test.js` needs the author's own script PDF next to the repo files and is
for manual runs. `verify_qr.js` decodes the payment QR on docs/ticket.html and
checks the Copy button.

Suites rebuild their own fixtures (shows, cues, generated WAVs) and assume the
built app files exist: run `python3 src/build.py` first after cloning and after any template change.
