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

A few checks need the machine to genuinely output audio: headless Chrome only
advances a track's `currentTime` when the audio device is awake, so on a locked
or idle Mac those checks report `SKIP ... (no audio output on this machine)`
rather than failing. Everything else, including the timed level changes, drives
the track position directly and runs anywhere. If you are chasing a playback
bug, confirm audio is alive first: a bare `new Audio(url).play()` should advance
past a second or so.

Run them ONE AT A TIME. Several suites assert on real playback timing (audio
position, fade levels, IndexedDB reads); two Chrome instances competing for the
CPU make those checks fail for no reason.

Notes for anyone editing the music engine: read a player's effective level with
`playerLevel(p)`, not `p.a.volume`, because playback routes through a WebAudio
gain node (iOS ignores volume writes on audio elements). Labels inside the cue
editor must stay unique, since suites find fields by their label text.
