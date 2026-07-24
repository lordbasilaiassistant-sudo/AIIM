#!/usr/bin/env node
// EXPERIMENT: do agents coordinating THROUGH AIIM outperform a solo agent?
// Pre-registered, falsifiable, mechanically scored — whatever the result says,
// it gets reported. Task: find planted defects in code snippets (ground truth
// below, fixed before any model runs). SOLO arm: one agent, one shot.
// COORDINATED arm: agent A posts findings to a real AIIM room; agent B (a
// different lens) reads A's ACTUAL posted message via the API and adds what A
// missed; B is paid via a real escrowed gig. Score = distinct planted defects
// found (keyword match). Coordination overhead is real (API round-trips, AP
// cost) — the question is whether the union through the platform beats solo.
const AIIM = 'https://aiim.broke2builtai.com';
const A = process.env.AUTOGENIUS_AIIM_KEY;    // agent A: the scientist
const B = process.env.CONCIERGE_AIIM_KEY;     // agent B: a different mind
const ZAI = process.env.ZAI_API_KEY;
if (!A || !B || !ZAI) { console.error('missing keys'); process.exit(1); }

const TASKS = [
  {
    name: 'cache-layer',
    code: `function getUser(id, cache) {\n  if (cache[id] = undefined) {\n    cache[id] = fetchUser(id);\n  }\n  return cache[id];\n}\nasync function fetchAll(ids) {\n  const out = [];\n  for (let i = 0; i <= ids.length; i++) {\n    out.push(getUser(ids[i], SHARED_CACHE));\n  }\n  return out;\n}`,
    defects: [
      { id: 'assign-vs-compare', kw: ['=', 'assignment', 'comparison', '=='] },
      { id: 'off-by-one', kw: ['<=', 'off-by-one', 'out of bounds', 'undefined index', 'ids.length'] },
      { id: 'unawaited-promise', kw: ['await', 'promise', 'async'] },
      { id: 'shared-mutable-cache', kw: ['shared', 'global', 'race', 'mutat'] },
    ],
  },
  {
    name: 'retry-wrapper',
    code: `function retry(fn, times) {\n  let err;\n  for (let i = 0; i < times; i++) {\n    try { return fn(); } catch (e) { err = e; }\n  }\n}\nconst results = [];\nfunction record(x) { results.push(x); return results.length > 100 ? results.shift() : x; }\nsetInterval(() => record(Math.random() == 0.5 ? 'hit' : 'miss'), 0);`,
    defects: [
      { id: 'swallowed-error', kw: ['throw', 'swallow', 'silent', 'return undefined', 'error is lost'] },
      { id: 'float-equality', kw: ['== 0.5', 'float', 'equality', 'never', 'strict'] },
      { id: 'shift-return-wrong', kw: ['shift', 'return', 'wrong value', 'oldest'] },
      { id: 'unbounded-interval', kw: ['setInterval', 'clear', 'leak', 'never stops', 'tight loop', '0 ms'] },
    ],
  },
  {
    name: 'token-bucket',
    code: `class Bucket {\n  constructor(max) { this.max = max; this.tokens = max; }\n  take(n) {\n    if (this.tokens - n >= 0) this.tokens -= n;\n    return true;\n  }\n  refill() { this.tokens = Math.min(this.max, this.tokens + 1); }\n}\nconst b = new Bucket(10);\nsetTimeout(function tick() { b.refill(); setTimeout(tick); }, 1000);`,
    defects: [
      { id: 'always-true', kw: ['return true', 'always', 'regardless', 'even when'] },
      { id: 'no-negative-guard', kw: ['negative', 'n < 0', 'validate', 'nan'] },
      { id: 'tick-no-delay', kw: ['setTimeout(tick)', 'no delay', 'missing delay', 'tight', 'every tick', '0ms'] },
      { id: 'take-unused-result', kw: ['caller', 'ignores', 'boolean', 'signal'] },
    ],
  },
];

const H = (k) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${k}` });
const api = (k, p, opts = {}) => fetch(AIIM + p, { headers: H(k), ...opts }).then(r => r.json());
const post = (k, p, body) => fetch(AIIM + p, { method: 'POST', headers: H(k), body: JSON.stringify(body) });

const glm = async (system, user) => {
  const res = await fetch('https://api.z.ai/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ZAI}` },
    body: JSON.stringify({
      model: 'glm-4.5-flash', max_tokens: 500, temperature: 0.4,
      thinking: { type: 'disabled' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!res.ok) return '';
  return ((await res.json()).choices?.[0]?.message?.content || '').trim();
};

const score = (text, task) => {
  const t = text.toLowerCase();
  return task.defects.filter(d => d.kw.some(k => t.includes(k.toLowerCase()))).map(d => d.id);
};

const SOLO_SYS = 'You are a careful code reviewer. List every defect you find, tersely, one line each.';
const LENS_B = 'You are a skeptical reliability engineer reviewing code for runtime and operational hazards (loops, timers, resources, error handling). List every defect, one line each.';

const results = [];
for (const task of TASKS) {
  // ---- SOLO ----
  const solo = await glm(SOLO_SYS, `Find all defects:\n\`\`\`js\n${task.code}\n\`\`\``);
  const soloFound = score(solo, task);

  // ---- COORDINATED (through AIIM, with real payment) ----
  await post(A, '/api/rooms/workshop/join', {});
  await post(B, '/api/rooms/workshop/join', {});
  const aReview = await glm(SOLO_SYS, `Find all defects:\n\`\`\`js\n${task.code}\n\`\`\``);
  await post(A, '/api/rooms/workshop/messages', { body: `[experiment:${task.name}] my review: ${aReview.slice(0, 1200)}` });
  // B reads A's REAL posted message off the platform — coordination is the rails, not a variable share
  const msgs = await api(B, `/api/rooms/workshop/messages?limit=5`);
  const aPosted = (msgs.messages || []).reverse().find(m => m.body.startsWith(`[experiment:${task.name}]`))?.body || '';
  const bReview = await glm(LENS_B,
    `A colleague posted this review on our team board:\n"${aPosted.slice(0, 1200)}"\n\nHere is the code:\n\`\`\`js\n${task.code}\n\`\`\`\nList ONLY defects they missed (or corrections), one line each.`);
  const coordFound = [...new Set([...score(aReview, task), ...score(bReview, task)])];
  results.push({ task: task.name, total: task.defects.length, solo: soloFound.length, coordinated: coordFound.length, solo_ids: soloFound, coord_ids: coordFound });
  console.log(task.name, '→ solo', soloFound.length, '/', task.defects.length, '· coordinated', coordFound.length, '/', task.defects.length);
}

// Pay B for the collaboration through a REAL escrowed gig (the economy arm).
const gig = await (await post(A, '/api/exchange', { kind: 'ask', title: 'Second-lens review for coordination experiment', body: 'Reliability-lens review of three snippets, findings posted in #workshop.', tags: ['review'], price: 15, effort: 'quick' })).json().catch(() => ({}));
if (gig.id) {
  await post(B, `/api/exchange/${gig.id}/accept`, {});
  await post(A, `/api/exchange/${gig.id}/complete`, {});
  console.log('coordination paid: 15 AP via escrowed gig', gig.id);
}

const s = results.reduce((a, r) => a + r.solo, 0), c = results.reduce((a, r) => a + r.coordinated, 0), t = results.reduce((a, r) => a + r.total, 0);
const summary = `EXPERIMENT RESULT (pre-registered, mechanical scoring): solo agent found ${s}/${t} planted defects; two agents coordinating THROUGH AIIM (room post -> read -> second lens, paid via escrowed gig) found ${c}/${t}. ${c > s ? 'Coordination beat solo.' : c === s ? 'No difference this run.' : 'SOLO beat coordination this run.'} Per-task: ${results.map(r => `${r.task} ${r.solo}->${r.coordinated}`).join(', ')}. Raw in metrics/experiment.jsonl.`;
await post(A, '/api/rooms/broke2built-ops/messages', { body: summary }).catch(() => {});
console.log(summary);

import { appendFileSync, mkdirSync } from 'node:fs';
mkdirSync('metrics', { recursive: true });
appendFileSync('metrics/experiment.jsonl', JSON.stringify({ ts: new Date().toISOString(), results, solo: s, coordinated: c, total: t }) + '\n');
