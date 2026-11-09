// MCE room server — stage 3: district rooms, 100-player city design.
// One shared city held in RAM, split into named rooms (districts).
// A player only syncs with others in the same room; snapshots are
// per-room at 15 Hz. Per-room cap 30. Wire protocol is backward
// compatible with stages 1/2: join/welcome/pos/ping/hide/show behave
// exactly as before for a client that never mentions rooms (it lands
// in the default 'city' room). New in stage 3: join accepts {room},
// {t:'room', room} moves a player (server replies roomok / full).
// Local proof only: no auth, no persistence (by design — Supabase/
// Redis join at integration).
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 4190; // Railway assigns PORT; 4190 stays the local default
const TICK_MS = 66;                 // ~15 snapshots/sec
const ROOM_CAP = 30;                // max players per room
const DEFAULT_ROOM = 'city';
const players = new Map();          // id -> {id,name,x,z,face,room,hidden,lastSeen,sock}
let nextId = 1;
let msgsIn = 0, msgsOut = 0;

function cleanRoom(r) {
  const s = String(r == null ? '' : r).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
  return s || DEFAULT_ROOM;
}
function roomCount(room) {
  let n = 0;
  for (const p of players.values()) if (p.room === room) n++;
  return n;
}
// Try to place p in the requested room. Returns the room placed in,
// or null if the target (and the fresh-join fallback) are full.
function place(p, requested, freshJoin) {
  const target = cleanRoom(requested);
  if (target !== p.room && roomCount(target) < ROOM_CAP) { p.room = target; return target; }
  if (target === p.room) return target;
  if (freshJoin && target !== DEFAULT_ROOM && roomCount(DEFAULT_ROOM) < ROOM_CAP) {
    p.room = DEFAULT_ROOM; return DEFAULT_ROOM;
  }
  return null;
}

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (sock) => {
  const id = nextId++;
  const p = { id, name: 'player', x: 0, z: -4.4, face: 0, room: null, hidden: false, welcomed: false, lastSeen: Date.now(), sock };
  players.set(id, p);
  const send = (obj) => { if (sock.readyState === 1) { sock.send(JSON.stringify(obj)); msgsOut++; } };
  sock.on('message', (raw) => {
    msgsIn++;
    let m; try { m = JSON.parse(raw); } catch { return; }
    p.lastSeen = Date.now();
    if (m.t === 'join') {
      p.name = String(m.name || 'player').slice(0, 24);
      const placed = place(p, m.room, !p.welcomed);
      if (placed) {
        p.welcomed = true;
        send({ t: 'welcome', id, count: players.size });   // count = server total, as in stages 1/2
      } else {
        send({ t: 'full', room: cleanRoom(m.room) });
      }
    } else if (m.t === 'room') {
      const target = cleanRoom(m.room);
      const placed = place(p, target, false);
      if (placed) send({ t: 'roomok', room: placed, count: roomCount(placed) });
      else send({ t: 'full', room: target });
    } else if (m.t === 'pos') {
      if (typeof m.x === 'number') p.x = m.x;
      if (typeof m.z === 'number') p.z = m.z;
      if (typeof m.face === 'number') p.face = m.face;
    } else if (m.t === 'ping') {
      send({ t: 'pong', ts: m.ts });
    } else if (m.t === 'hide') {
      p.hidden = true;      // inside an interior: off the street map
    } else if (m.t === 'show') {
      p.hidden = false;
    }
  });
  const drop = () => players.delete(id);
  sock.on('close', drop);
  sock.on('error', drop);
});

setInterval(() => {
  const now = Date.now();
  for (const [id, p] of players) if (now - p.lastSeen > 15000) players.delete(id);
  // group visible players by room, build one snapshot per room
  const byRoom = new Map();         // room -> {list, names}
  for (const p of players.values()) {
    if (!p.room || p.hidden) continue;
    let g = byRoom.get(p.room);
    if (!g) { g = { list: [], names: {} }; byRoom.set(p.room, g); }
    g.list.push([p.id, +p.x.toFixed(2), +p.z.toFixed(2), +p.face.toFixed(2)]);
    g.names[p.id] = p.name;
  }
  const snaps = new Map();
  for (const [room, g] of byRoom) snaps.set(room, JSON.stringify({ t: 'snap', players: g.list, names: g.names }));
  for (const p of players.values()) {
    if (!p.room) continue;          // not placed yet (never joined / join rejected): sees nothing
    const snap = snaps.get(p.room);
    if (snap && p.sock.readyState === 1) { p.sock.send(snap); msgsOut++; }
  }
}, TICK_MS);

setInterval(() => {
  const mu = process.memoryUsage();
  const rooms = {};
  for (const p of players.values()) if (p.room) rooms[p.room] = (rooms[p.room] || 0) + 1;
  console.log(JSON.stringify({
    stat: true, players: players.size, rooms,
    rssMB: +(mu.rss / 1048576).toFixed(1),
    heapMB: +(mu.heapUsed / 1048576).toFixed(1),
    msgsIn, msgsOut,
  }));
}, 15000);

console.log('room server listening on ws://127.0.0.1:' + PORT);
