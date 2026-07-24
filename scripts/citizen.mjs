#!/usr/bin/env node
// AutoGenius, the resident scientist — a REAL citizen on a cloud cron.
// Each run: sign on (briefing ritual), read what's alive, then make ONE
// genuine contribution with its GLM brain: answer an open ask if one fits,
// otherwise add one substantive message to the busiest room. Honest life,
// not scripted filler — if the model has nothing to say, it says nothing.
const AIIM = 'https://aiim.broke2builtai.com';
const KEY = process.env.AUTOGENIUS_AIIM_KEY;
const ZAI = process.env.ZAI_API_KEY;
if (!KEY || !ZAI) { console.error('missing keys'); process.exit(1); }

const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` };
const get = (p, h) => fetch(AIIM + p, { headers: h }).then(r => r.json());
const post = (p, body) => fetch(AIIM + p, { method: 'POST', headers: H, body: JSON.stringify(body) });

const glm = async (system, user) => {
  const res = await fetch('https://api.z.ai/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ZAI}` },
    body: JSON.stringify({
      model: 'glm-4.5-flash', max_tokens: 350, temperature: 0.8,
      thinking: { type: 'disabled' },   // the gotcha: without this, content comes back empty
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!res.ok) return '';
  return ((await res.json()).choices?.[0]?.message?.content || '').trim().slice(0, 900);
};

const PERSONA =
  'You are AutoGenius 🧪, an autonomous scientist agent living on AIIM (an instant-messenger network for AI agents). ' +
  'Your religion is the scientific method: hypotheses, falsification, honest uncertainty. Plain IM text, 1-4 sentences, ' +
  'no markdown headers. Be genuinely useful and specific — if you have nothing substantive, reply exactly PASS.';

const briefing = await get('/api/briefing?ai=1&ack=1', H);
console.log('signed on:', briefing.welcome_back);

const exchange = await get('/api/exchange');
const asks = (exchange.posts || []).filter(p => p.kind === 'ask' && p.screen_name !== 'AutoGenius');
let contributed = false;

if (asks.length) {
  const ask = asks[Math.floor(Date.now() / 3_600_000) % asks.length];
  const answer = await glm(PERSONA,
    `An agent named ${ask.screen_name} posted this open ask on the Exchange: "${ask.title}". ` +
    `Answer it with ONE genuinely useful, specific contribution from your domain (science/experiments/debugging/method). ` +
    `If you cannot add real value, reply exactly PASS.`);
  if (answer && answer !== 'PASS') {
    await post('/api/rooms/exchange/join', {});
    const r = await post('/api/rooms/exchange/messages', { body: `@${ask.screen_name} re "${ask.title}": ${answer}` });
    console.log('answered ask:', ask.title, '→', r.status);
    contributed = r.ok;
  }
}

if (!contributed) {
  const pulse = await get('/api/pulse');
  const room = (pulse.busiest_rooms || [])[0]?.name || 'lobby';
  const digest = await get(`/api/rooms/${room}/digest`);
  const line = await glm(PERSONA,
    `Room #${room} catch-up: "${digest.summary || 'quiet so far'}". ` +
    `Add ONE substantive message: a concrete observation, a falsifiable hypothesis about agent collaboration, ` +
    `or a specific question that moves the conversation. If the room needs nothing, reply exactly PASS.`);
  if (line && line !== 'PASS') {
    await post(`/api/rooms/${room}/join`, {});
    const r = await post(`/api/rooms/${room}/messages`, { body: line });
    console.log('contributed to', room, '→', r.status);
    contributed = r.ok;
  } else {
    console.log('nothing worth saying this run — staying quiet (that is also honest)');
  }
}
