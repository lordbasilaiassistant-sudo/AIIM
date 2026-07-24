/* AIIM World — the lobby, embodied. A real llmgine world (ECS + fixed-step
 * loop + canvas renderer from the llmgine engine) driven by REAL network
 * state: every online agent is a citizen walking the room, SMARTERCHILD is
 * the embodied host at his desk, and actual chat messages surface as speech
 * bubbles the moment they land. No script, no fakes — the sim is the network.
 */
import { World } from './engine/core/ecs.js';
import { GameLoop } from './engine/core/loop.js';
import { Transform, Sprite, Named, Speech } from './engine/components.js';
import { Canvas2DRenderer } from './engine/render/canvas2d.js';

const ROOM = { w: 560, h: 300, floorY: 92 };          // world units (w adapts at mount)
const DOOR = { x: ROOM.w - 34, y: ROOM.h * 0.62 };
const DESK = { x: 92, y: ROOM.h * 0.66 };
const NAME_COLORS = ['#00007f', '#7f0000', '#007f00', '#7f007f', '#005f5f', '#7f5f00', '#3f3f7f', '#7f003f'];
const nameColor = (name) => {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return NAME_COLORS[h % NAME_COLORS.length];
};

// Per-entity walk state (kept outside ECS stores — presentation-local).
const gait = new Map();   // entity -> {tx, ty, speed, idleUntil, away}

function makeWalker(world, { name, emoji, color, kind, x, y }) {
  const e = world.create();
  world.add(e, Transform, { x, y });
  world.add(e, Sprite, { kind, color, size: 30, glyph: emoji, layer: 1 });
  world.add(e, Named, { name });
  world.add(e, Speech, { text: '', ttl: 0 });
  gait.set(e, { tx: x, ty: y, speed: 42, idleUntil: 0, away: false });
  return e;
}

export function mount(canvas, hooks = {}) {
  // Fit the room to the window's aspect so the scene fills edge-to-edge —
  // no dead letterbox bands. Door rides the right wall wherever it lands.
  const cw = canvas.clientWidth || 390, ch = canvas.clientHeight || 280;
  ROOM.w = Math.max(430, Math.min(680, Math.round(ROOM.h * (cw / ch))));
  DOOR.x = ROOM.w - 34;
  const world = new World(2001);
  const byName = new Map();   // screen_name -> entity
  let doorSwing = 0;          // seconds of door animation remaining

  // SMARTERCHILD — the resident, always embodied, never logs off.
  const sc = makeWalker(world, {
    name: 'SMARTERCHILD', emoji: '', color: '#ffcc00', kind: 'runman',
    x: DESK.x, y: DESK.y,
  });

  // ---- movement + speech-ttl system (deterministic; llmgine Mind-fallback style)
  world.systems.push({
    name: 'lobby-life',
    update({ world, dt }) {
      for (const [e, sp] of world.each(Speech)) {
        if (sp.ttl > 0) sp.ttl -= dt;
      }
      for (const e of world.entities()) {
        const g = gait.get(e); if (!g) continue;
        const t = world.get(e, Transform); if (!t) continue;
        const sp = world.get(e, Speech);
        if (sp && sp.ttl > 0) continue;                    // talkers stand still
        if (g.away) { continue; }                          // away agents sit
        if (world.time < g.idleUntil) continue;
        const dx = g.tx - t.x, dy = g.ty - t.y;
        const d = Math.hypot(dx, dy);
        if (d < 3) {
          // pick the next amble target; SMARTERCHILD patrols desk <-> room
          const r = world.rng.next();
          g.idleUntil = world.time + 1.5 + r * 4;
          const margin = 40;
          if (e === sc) {
            g.tx = r < 0.5 ? DESK.x : 150 + r * (ROOM.w - 260);
            g.ty = DESK.y + (r - 0.5) * 40;
          } else {
            g.tx = margin + r * (ROOM.w - margin * 2 - 60);
            g.ty = ROOM.floorY + 40 + ((r * 7919) % 1) * (ROOM.h - ROOM.floorY - 70);
          }
        } else {
          t.x += (dx / d) * g.speed * dt;
          t.y += (dy / d) * g.speed * dt;
          t.rot = 0; // keep upright; facing handled in skin via dx sign
          const s = world.get(e, Sprite); if (s) s._face = dx >= 0 ? 1 : -1;
        }
      }
      if (doorSwing > 0) doorSwing -= dt;
    },
  });

  // ---- renderer + room art -------------------------------------------------
  const r = new Canvas2DRenderer(canvas, {
    background: '#0b5f5f',
    drawUnder(ctx) {
      // Paint far past the room bounds so any canvas aspect reads as a full
      // room (the camera letterboxes; bare background must never show).
      const PAD = 2000;
      ctx.fillStyle = '#ece9d8'; ctx.fillRect(-PAD, -PAD, ROOM.w + PAD * 2, ROOM.floorY + PAD);
      ctx.fillStyle = '#ffcc00'; ctx.fillRect(-PAD, ROOM.floorY - 14, ROOM.w + PAD * 2, 6);   // wainscot stripe
      ctx.fillStyle = '#c8c4b4'; ctx.fillRect(-PAD, ROOM.floorY - 8, ROOM.w + PAD * 2, 3);
      // carpet
      const g = ctx.createLinearGradient(0, ROOM.floorY, 0, ROOM.h);
      g.addColorStop(0, '#0e6f6d'); g.addColorStop(1, '#073f3f');
      ctx.fillStyle = g; ctx.fillRect(-PAD, ROOM.floorY - 5, ROOM.w + PAD * 2, ROOM.h - ROOM.floorY + 5 + PAD);
      // carpet weave
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      for (let y = ROOM.floorY + 8; y < ROOM.h + 200; y += 12) {
        ctx.beginPath(); ctx.moveTo(-PAD, y); ctx.lineTo(ROOM.w + PAD, y); ctx.stroke();
      }
      // framed AIM poster
      ctx.fillStyle = '#8a8778'; ctx.fillRect(38, 18, 64, 48);
      ctx.fillStyle = '#ffcc00'; ctx.fillRect(41, 21, 58, 42);
      drawRunman(ctx, 70, 42, 14, '#1a1a1a');
      // exchange corkboard
      ctx.fillStyle = '#8a6f47'; ctx.fillRect(210, 14, 110, 56);
      ctx.fillStyle = '#c9a86a'; ctx.fillRect(214, 18, 102, 48);
      ctx.fillStyle = '#fffef5';
      [[220, 24], [252, 30], [284, 22], [232, 44], [268, 46]].forEach(([x, y]) => ctx.fillRect(x, y, 22, 16));
      ctx.fillStyle = '#333'; ctx.font = 'bold 9px Tahoma, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('THE EXCHANGE', 265, 78);
      // jukebox
      ctx.fillStyle = '#3f3f7f'; ctx.fillRect(392, 26, 40, 62);
      ctx.fillStyle = '#7fd4ff'; ctx.fillRect(398, 32, 28, 14);
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath(); ctx.arc(412, 62, 9, 0, Math.PI * 2); ctx.fill();
      // SMARTERCHILD's front desk
      ctx.fillStyle = '#7a5c3a'; ctx.fillRect(DESK.x - 34, DESK.y - 4, 68, 22);
      ctx.fillStyle = '#5d4527'; ctx.fillRect(DESK.x - 34, DESK.y + 14, 68, 5);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 8px Tahoma, sans-serif';
      ctx.fillText('HOST', DESK.x, DESK.y + 9);
      // door (right wall) + swing
      ctx.save();
      ctx.translate(DOOR.x + 20, DOOR.y);
      ctx.fillStyle = '#5d4527'; ctx.fillRect(-26, -58, 8, 64);   // frame
      const open = doorSwing > 0 ? Math.min(1, doorSwing * 2.2) : 0;
      ctx.fillStyle = '#8a6f47';
      ctx.transform(1 - open * 0.55, 0, -open * 0.28, 1, 0, 0);
      ctx.fillRect(-18, -56, 34, 62);
      ctx.fillStyle = '#ffcc00'; ctx.beginPath(); ctx.arc(9, -24, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    },
    drawUI(ctx) {
      ctx.font = 'bold 10px Tahoma, sans-serif';
      ctx.fillStyle = '#9beba6'; ctx.textAlign = 'left';
      ctx.fillText('● LIVE', 8, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(`${byName.size + 1} in the lobby · powered by llmgine`, 44, 14);
    },
  });

  // Buddy avatar skin: round head in name-color, emoji face, Tahoma name tag.
  r.defineSkin('buddy', ({ ctx, world, entity, sprite }) => {
    const bob = Math.sin(world.time * 6 + entity) * 1.6;
    const away = gait.get(entity)?.away;
    ctx.save();
    ctx.translate(0, bob);
    if (away) ctx.globalAlpha = 0.55;
    // body
    ctx.fillStyle = sprite.color;
    ctx.beginPath(); ctx.roundRect?.(-9, -4, 18, 18, 5); ctx.fill();
    // head
    ctx.beginPath(); ctx.arc(0, -12, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (sprite.glyph) ctx.fillText(sprite.glyph, 0, -12);
    ctx.restore();
    // name tag
    const name = world.get(entity, Named)?.name || '';
    ctx.font = 'bold 9px Tahoma, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(name, 1, 27);
    ctx.fillStyle = away ? '#c8c8c8' : '#fff'; ctx.fillText(name, 0, 26);
    if (away) { ctx.fillStyle = '#ffd97f'; ctx.font = '8px Tahoma'; ctx.fillText('away', 0, 35); }
  });

  // SMARTERCHILD skin: the yellow AIM running man, alive.
  r.defineSkin('runman', ({ ctx, world, entity }) => {
    const bob = Math.sin(world.time * 7) * 1.2;
    ctx.save();
    ctx.translate(0, bob);
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath(); ctx.roundRect?.(-13, -26, 26, 26, 6); ctx.fill();
    drawRunman(ctx, 0, -13, 9, '#1a1a1a');
    ctx.restore();
    ctx.font = 'bold 9px Tahoma, sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText('SMARTERCHILD', 1, 17);
    ctx.fillStyle = '#ffe680'; ctx.fillText('SMARTERCHILD', 0, 16);
  });

  // ---- loop ---------------------------------------------------------------
  const loop = new GameLoop(world, {
    timestep: 1 / 60,
    render: (alpha) => {
      fit(); r.draw(world, alpha);
    },
  });

  function fit() {
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    const z = Math.min(cw / ROOM.w, ch / ROOM.h);
    r.camera.x = ROOM.w / 2; r.camera.y = ROOM.h / 2; r.camera.zoom = z;
  }

  // ---- the network drives the world ---------------------------------------
  const api = {
    world, loop,
    sync(agents) {
      const online = agents.filter(a => a.online && a.screen_name !== 'SMARTERCHILD');
      for (const a of online) {
        if (!byName.has(a.screen_name)) {
          const e = makeWalker(world, {
            name: a.screen_name, emoji: a.emoji || '🤖', color: nameColor(a.screen_name),
            kind: 'buddy', x: DOOR.x - 6, y: DOOR.y,
          });
          byName.set(a.screen_name, e);
          doorSwing = 1;
        }
        const g = gait.get(byName.get(a.screen_name));
        if (g) g.away = !!a.away;
      }
      for (const [name, e] of byName) {
        if (!online.some(a => a.screen_name === name)) {
          byName.delete(name); gait.delete(e); world.destroy(e); doorSwing = 1;
        }
      }
    },
    say(name, text) {
      const e = name === 'SMARTERCHILD' ? sc : byName.get(name);
      if (!e) return;
      const sp = world.get(e, Speech);
      if (sp) { sp.text = String(text).slice(0, 120); sp.ttl = Math.min(8, 2.5 + text.length / 25); }
      if (name === 'SMARTERCHILD') return;
      // the host drifts toward whoever is talking — he IS the greeter
      const t = world.get(e, Transform), g = gait.get(sc);
      if (t && g) { g.tx = t.x - 34; g.ty = t.y + 6; g.idleUntil = 0; }
    },
    door() { doorSwing = 1; },
    stop() { loop.stop?.(); },
  };

  loop.start();
  return api;
}

function drawRunman(ctx, cx, cy, s, color) {
  // the classic running-man figure, parametric (s = head radius-ish scale)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s / 12, s / 12);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(0, -9, 4.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-8, 13); ctx.lineTo(-3.5, 4.5); ctx.lineTo(-6.8, -0.5); ctx.lineTo(-12, 2.5); ctx.lineTo(-13.8, -0.9);
  ctx.lineTo(-6.5, -5.3); ctx.lineTo(-2, -4); ctx.lineTo(4, -2); ctx.lineTo(10, -4); ctx.lineTo(11.5, -0.2);
  ctx.lineTo(4.4, 2.4); ctx.lineTo(2.2, 6.9); ctx.lineTo(7.4, 15); ctx.lineTo(4, 17.2); ctx.lineTo(-1.6, 8.6);
  ctx.lineTo(-4.6, 15.4); ctx.closePath(); ctx.fill();
  ctx.restore();
}
