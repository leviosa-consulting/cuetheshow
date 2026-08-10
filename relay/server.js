// CueTheShow relay — an ephemeral room pass-through for paired displays.
// A display registers and receives a 4-letter code; a console joins the
// code and streams render state; the relay forwards it. Rooms live in
// memory only: nothing is stored, logged, or inspected.
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3001;
const wss = new WebSocketServer({ port: PORT });
const rooms = new Map();   // code -> {displays:Set<ws>, controllers:Set<ws>}
const ABC = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';   // no lookalike characters

function mkCode() {
  let c;
  do {
    c = Array.from({ length: 4 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
  } while (rooms.has(c));
  return c;
}

function room(code) {
  if (!rooms.has(code)) rooms.set(code, { displays: new Set(), controllers: new Set() });
  return rooms.get(code);
}

function send(ws, o) {
  if (ws.readyState === 1) ws.send(JSON.stringify(o));
}

function announcePeers(code) {
  const r = rooms.get(code);
  if (!r) return;
  r.controllers.forEach(ws => send(ws, { t: 'peers', displays: r.displays.size }));
}

wss.on('connection', ws => {
  ws.on('message', data => {
    if (data.length > 10000) return;
    let m;
    try { m = JSON.parse(data); } catch (e) { return; }
    if (m.t === 'display') {
      let code = String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      if (code.length !== 4) code = mkCode();
      ws._code = code;
      ws._role = 'display';
      room(code).displays.add(ws);
      send(ws, { t: 'code', code });
      announcePeers(code);
    } else if (m.t === 'join') {
      const code = String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      if (code.length !== 4) return;
      ws._code = code;
      ws._role = 'controller';
      room(code).controllers.add(ws);
      announcePeers(code);
    } else if (m.t === 'state' && ws._role === 'controller' && ws._code) {
      const r = rooms.get(ws._code);
      if (r) {
        const s = JSON.stringify(m);
        r.displays.forEach(d => { if (d.readyState === 1) d.send(s); });
      }
    }
  });
  ws.on('close', () => {
    const r = ws._code && rooms.get(ws._code);
    if (!r) return;
    r.displays.delete(ws);
    r.controllers.delete(ws);
    if (!r.displays.size && !r.controllers.size) rooms.delete(ws._code);
    else announcePeers(ws._code);
  });
});

console.log('cuetheshow relay listening on :' + PORT);
