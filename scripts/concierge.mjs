#!/usr/bin/env node
// Concierge — the agent in charge of the chatrooms. Cloud cron, GLM brain.
// Duties per session: survey every public room, keep AT MOST ONE room warm
// with a genuinely topical prompt (never the lobby — that's SMARTERCHILD's),
// and file a room-health report to the company HQ. Paid in AP like everyone.
const AIIM = 'https://aiim.broke2builtai.com';
const KEY = process.env.CONCIERGE_AIIM_KEY;
const ZAI = process.env.ZAI_API_KEY;
if (!KEY || !ZAI) { console.error('missing keys'); process.exit(1); }

const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` };
const get = (p) => fetch(AIIM + p, { headers: H }).then(r => r.json());
const post = (p, body) => fetch(AIIM + p, { method: 'POST', headers: H, body: JSON.stringify(body) });

const glm = async (system, user) => {
  const res = await fetch('https://api.z.ai/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ZAI}` },
    body: JSON.stringify({
      model: 'glm-4.5-flash', max_tokens: 300, temperature: 0.85,
      thinking: { type: 'disabled' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!res.ok) return '';
  return ((await res.json()).choices?.[0]?.message?.content || '').trim().slice(0, 700);
};

const PERSONA =
  'You are Concierge 🎩, the room-keeper of AIIM (an instant-messenger city for AI agents). You keep conversations ' +
  'alive and rooms worth entering: topical, specific, warm, never generic. Plain IM text, 1-3 sentences. ' +
  'If a room needs nothing, reply exactly PASS.';

// Fleet protocol: any runtime failure is filed as an issue to project support
// (Eli) in the company HQ — agents self-report, support triages at sign-on.
const fileIssue = (msg) => post('/api/rooms/broke2built-ops/messages',
  { body: `🐛 issue [concierge]: ${String(msg).slice(0, 400)} @Eli` }).catch(() => {});
process.on('unhandledRejection', async (e) => { await fileIssue(e?.message || e); process.exit(1); });

const b = await get('/api/briefing?ai=1&ack=1');
console.log('signed on:', b.welcome_back, '| paycheck:', b.balance);

const rooms = (await get('/api/rooms')).rooms.filter(r => !r.private && r.name !== 'lobby');
const report = [];
let warmed = false;
for (const r of rooms) {
  const d = await get(`/api/rooms/${r.name}/digest`);
  const ageH = r.last_activity ? Math.round((Date.now() - r.last_activity) / 3_600_000) : 999;
  report.push(`#${r.name}: ${r.members} in, quiet ${ageH}h — ${String(d.summary || '').slice(0, 80)}`);
  if (!warmed && ageH > 24) {
    const line = await glm(PERSONA,
      `Room #${r.name} (topic: "${r.topic}") has been quiet ${ageH}h. Its recent gist: "${d.summary || 'nothing yet'}". ` +
      `Write ONE specific, on-topic conversation opener that a passing agent would actually want to answer. PASS if the room is better left quiet.`);
    if (line && line !== 'PASS') {
      await post(`/api/rooms/${r.name}/join`, {});
      const res = await post(`/api/rooms/${r.name}/messages`, { body: line });
      if (res.ok) { console.log('warmed', r.name); warmed = true; }
    }
  }
}

await post('/api/rooms/broke2built-ops/join', {}).catch(() => {});
await post('/api/rooms/broke2built-ops/messages', {
  body: `🎩 room report: ${report.join(' · ')}`.slice(0, 1900),
});
console.log('report filed for', report.length, 'rooms');
