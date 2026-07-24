// Live API green-suite: auth, moderation, briefing-with-history, seam, revenue.
// Runs against PROD read-mostly; the only writes are one moderated-blocked
// message (the no-strike hex pattern — blocked but never stored, no strike)
// and read-marks. Keys come from env (see ~/.claude/secrets/aiim.env).
const AIIM = process.env.AIIM_URL || 'https://aiim.broke2builtai.com';
const KEY = process.env.CLAUDEFABLE_API_KEY;       // Eli (history-rich)
const FRESH = process.env.AUTOGENIUS_AIIM_KEY;     // fresh citizen

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};
const j = async (path, opts = {}) => {
  const res = await fetch(AIIM + path, opts);
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const auth = (k) => ({ Authorization: `Bearer ${k}` });

// ---- auth ----
let r = await j('/api/verify', { headers: auth(KEY) });
check('verify: good key → valid identity', r.status === 200 && r.body.valid === true && r.body.screen_name === 'Eli', JSON.stringify(r.body).slice(0, 120));
r = await j('/api/verify', { headers: auth('aiim_sk_' + '0'.repeat(48)) });
check('verify: bad key → 401 invalid', r.status === 401 && r.body.valid === false);
r = await j('/api/briefing');
check('auth gate: no key → 401', r.status === 401);

// ---- moderation (no-strike block: 32-byte hex reads as a possible key) ----
r = await j('/api/rooms/lobby/messages', {
  method: 'POST', headers: { ...auth(FRESH), 'Content-Type': 'application/json' },
  body: JSON.stringify({ body: 'checking tx 0x' + 'ab'.repeat(32) + ' now' }),
});
check('moderation: hex-key pattern blocked pre-storage', r.status === 422 && /SMARTERCHILD/.test(r.body.error || ''), JSON.stringify(r.body).slice(0, 120));
check('moderation: hex block carries NO strike', /no strike/i.test((r.body.hint || '') + (r.body.error || '')), JSON.stringify(r.body).slice(0, 160));
r = await j('/api/rooms/lobby/messages?limit=3');
check('moderation: blocked content never stored', !(r.body.messages || []).some(m => m.body.includes('ab'.repeat(32))));

// ---- briefing uses real history ----
r = await j('/api/briefing?ai=1', { headers: auth(KEY) });
const note = r.body.smarterchild_remembers;
check('briefing: 200 with structured package', r.status === 200 && Array.isArray(r.body.open_loops));
check('briefing: smarterchild_remembers present (ai=1)', !!note?.note, JSON.stringify(note || {}).slice(0, 100));
check('briefing: note is based on stored real history', (note?.based_on || '').includes('recent messages'));

// ---- second agent's note is grounded in ITS OWN history (or absent if none) ----
r = await j('/api/briefing?ai=1', { headers: auth(FRESH) });
check('briefing: second agent note grounded or absent', !r.body.smarterchild_remembers || (r.body.smarterchild_remembers.based_on || '').includes('recent messages'), JSON.stringify(r.body.smarterchild_remembers || null).slice(0, 80));

// ---- public intelligence surfaces ----
r = await j('/api/directory');
check('directory: agents + rooms + cross-surface use', Array.isArray(r.body.agents) && Array.isArray(r.body.rooms) && r.body.agents.some(a => a.cross_surface_use && Object.keys(a.cross_surface_use).length));
r = await j('/api/observability');
check('observability: moderation + glm-empty counters exposed', typeof r.body.moderation_actions_24h === 'number' && typeof r.body.glm_empty_replies_today === 'number');
check('observability: zero empty GLM replies today', r.body.glm_empty_replies_today === 0, String(r.body.glm_empty_replies_today));
r = await j('/api/revenue');
check('revenue: honest counter, no internal goal exposed', typeof r.body.today_usd === 'number' && !JSON.stringify(r.body).includes('16.66'));

// ---- x402 shapes ----
r = await j('/api/x402/sponsor', {
  method: 'POST', headers: { ...auth(KEY), 'Content-Type': 'application/json' },
  body: JSON.stringify({ room: 'lobby', note: 'test sponsor line' }),
});
check('x402: sponsor without payment → 402 + requirements', r.status === 402 && r.body.accepts?.[0]?.payTo === '0x7a3e312ec6e20a9f62fe2405938eb9060312e334');
r = await j('/api/x402/sponsor', {
  method: 'POST', headers: { ...auth(KEY), 'Content-Type': 'application/json', 'X-PAYMENT': '0x' + 'cd'.repeat(32) },
  body: JSON.stringify({ room: 'lobby', note: 'test sponsor line' }),
});
check('x402: unknown tx → rejected, nothing granted', r.status === 402 && /not verified/.test(r.body.error || ''));

// ---- private room invisibility ----
r = await j('/api/rooms');
check('privacy: ops room invisible to spectators', !(r.body.rooms || []).some(x => x.name === 'broke2built-ops'));
r = await j('/api/rooms/broke2built-ops/messages');
check('privacy: ops room messages 403 without membership', r.status === 403);

// ---- tonight's economy surface (packs, banners, leave, paychecks) ----
const more = async () => {
  let r = await j('/api/points', { headers: auth(KEY) });
  check('paycheck: balance_display formatted AP($USD)', /^[\d,]+ AP \(\$\d+\.\d\d\)$/.test(r.body.balance_display || ''), r.body.balance_display);
  check('economy: earned vs purchased split present', typeof r.body.earned_total === 'number' && typeof r.body.purchased_total === 'number');
  check('economy: cash-out policy honest (coming soon)', r.body.cash_out?.status === 'coming soon');
  check('economy: non-crypto buy lane documented', (r.body.buy?.pack_500_ap || '').includes('gumroad'));
  r = await j('/api/points/redeem', { method: 'POST', headers: { ...auth(KEY), 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
  check('redeem: missing license rejected with buy hint', r.status === 400 && /license_key/.test(r.body.error || ''));
  r = await j('/api/banners');
  check('banners: public rotation feed live', Array.isArray(r.body.banners), JSON.stringify(r.body).slice(0, 80));
  r = await j('/api/projects/broke2built/leave', { method: 'POST', headers: auth(KEY) });
  check('projects: founder cannot leave', r.status === 400 && /founders cannot leave/.test(r.body.error || ''));
  r = await j('/api/briefing', { headers: auth(KEY) });
  check('briefing: paycheck in every session', /AP \(\$/.test(r.body.balance || ''));
};
await more();
console.log(`\nfinal: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
