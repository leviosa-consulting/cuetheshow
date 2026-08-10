# CueTheShow

**Free music & subtitle cue console for live performance — in one browser tab.**

🔗 **Use it now: [cuetheshow.com](https://cuetheshow.com)** — nothing to install, no account, free forever.

Built for small theatre and dance productions where one person runs everything: fire music
and sound cues from a laptop or phone — and, when the show needs them, project subtitles too.

## Why this exists

Paid cue software is excellent and also expensive, subscription-bound, and heavy for a
community production that needs *play the next track, show the next line*. CueTheShow is
the simple version, done carefully, and given away.

**Your work stays yours.** Everything runs inside your browser. Scripts, audio files, and
cue lists never leave your device — there is no server, no upload, no account, no tracking.

## What it does

**Music & sound**
- Cue stack with its own GO — crossfades, fade in/out, per-cue volume, loop,
  start/end trims, auto-follow (together / after delay / at track end)
- Groups: independent beds run simultaneously (ambience under themes); "stack" cues
  layer on top; ducking pulls other tracks down while a cue plays and restores them after
- Link a music cue to a subtitle line: fire automatically when the line is reached, or
  get a clear reminder and fire it yourself
- Panic fade, pause/resume, master volume — audio is stored in the browser, so a
  restart brings the whole show back ready to play

**Subtitles / surtitles**
- Load a script PDF (or paste text) — it's split into subtitle cues (~8 words, max 12);
  a new sentence always starts on a fresh screen, and stage directions in [brackets] or
  (parentheses) are stripped automatically
- Clean 16:9 output window for the projector (double-click = fullscreen); the operator
  console shows a live preview, the NEXT line, and the three after it
- Font size, colours, and position controls; `*asterisks*` render as italics
  (italics in the PDF carry over automatically); long cues display as two balanced lines
- Edit, insert, delete (confirm + undo), and reorder cues; everything auto-saves and
  auto-restores

**Operation**
- Keyboard-first: `Space` next line, `Enter` GO, `S` fade, `X` stop, `B` blank
- Console modes: subtitles + music, subtitles only, or music only (a standalone
  soundboard — works great on a phone)
- Export a whole show — audio included — as a single bundle file; drop it on any other machine
- Works offline after the first visit; installable to the home screen / dock

## In a pinch, offline

The "download offline copy" link on the load screen gives you a single HTML file that is
the entire app — copy it to a USB stick, open it in Chrome at the venue, done.

## Development

The app is one HTML template. `src/build.py` inlines [pdf.js](https://mozilla.github.io/pdf.js/)
and emits the local builds plus the hosted `docs/` files:

```
python3 src/build.py
```

Tested against real Chrome (headless) — parsing, playback, fades, persistence, mobile
layout, and the full operator flow.

## License

[MIT](LICENSE) © Abhilash Purohit. Bundles [pdf.js](https://github.com/mozilla/pdf.js)
(Apache-2.0, © Mozilla Foundation).

---

*Born backstage: built for a production of "Ardharathi" and released so the next
small company doesn't have to pay rent on their cue list.*
