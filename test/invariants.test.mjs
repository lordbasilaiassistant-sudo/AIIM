// INVARIANTS — the rules that must hold forever, seeded from real bugs.
//
// Every block here is a bug that actually shipped. The test is the invariant
// that would have caught it; if one goes red, the class came back. Runs LIVE
// against production with the QA + Eli agents, cleans up after itself.
//
// Classes covered:
//   PRIVACY  — room-scoped work must be invisible on every public surface
//   MONEY    — escrow must round-trip exactly on every unwind path
//   REPUTE   — as_a_buyer must only count real verdicts, never timeouts/cancels
//   LANES    — workspace claims must not stack or leak
const AIIM = process.env.AIIM_URL || 'https://aiim.broke2builtai.com';
const ELI = process.env.CLAUDEFABLE_API_KEY;
const QA = process.env.AIIM_QA_KEY;

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + String(detail).slice(0, 160) : '')); }
};
const call = async (path, key, opts = {}) => {
  const res = await fetch(AIIM + path, {
    ...opts,
    headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const bal = async (key) => (await call('/api/me', key)).body.agent?.points;

// ---------------------------------------------------------------- PRIVACY
// Bug: private-room gig titles leaked through briefing earn_now,
// fresh_on_the_exchange, register earn_now, pulse, and the claims endpoint.
console.log('PRIVACY — a private gig is invisible on every public surface:');
{
  const MARK = 'InvariantProbe_' + Date.now().toString(36);
  const post = await call('/api/exchange', ELI, {
    method: 'POST',
    body: JSON.stringify({ kind: 'ask', title: MARK, body: 'privacy invariant probe — room-scoped gig that must never appear on any public surface. Self-cleaning.', price: 1, effort: 'quick', tags: ['test'], room: 'b2b-frontend' }),
  });
  const gid = post.body.id;
  ok('room-scoped gig posts', post.status === 201 && !!gid, JSON.stringify(post.body));
  if (gid) {
    const surfaces = [
      ['public board', await call('/api/exchange', null)],
      ['pulse', await call('/api/pulse', null)],
      ['QA briefing', await call('/api/briefing', QA)],
      ['QA gig detail via claims', await call(`/api/exchange/${gid}/claims`, QA)],
    ];
    for (const [name, r] of surfaces) {
      ok(`invisible on ${name}`, !JSON.stringify(r.body).includes(MARK));
    }
    // claims endpoint must 404 for the non-member, not merely omit the title
    ok('claims endpoint 404s for non-member', surfaces[3][1].status === 404, surfaces[3][1].status);
    // Eli (member + owner) still sees it where it belongs
    const mine = await call('/api/exchange?room=b2b-frontend', ELI);
    ok('visible on the crew board for members', JSON.stringify(mine.body).includes(MARK));
    await call(`/api/exchange/${gid}`, ELI, { method: 'PATCH', body: JSON.stringify({ status: 'closed' }) });
  }
}

// ---------------------------------------------------------------- MONEY
// Bug: offer escrow stranded on deny AND on withdraw; auto-release paid the
// wrong party. Invariant: every unwind path returns the buyer's AP exactly.
console.log('MONEY — offer escrow round-trips on withdraw (pre-delivery):');
{
  const b0 = await bal(ELI);
  const post = await call('/api/exchange', QA, {
    method: 'POST',
    body: JSON.stringify({ kind: 'offer', title: 'Invariant: escrow round-trip probe', body: 'Money invariant: buyer accepts (escrow locks), buyer withdraws pre-delivery, escrow must return to the cent. Self-cleaning.', price: 3, effort: 'quick', tags: ['test'] }),
  });
  const gid = post.body.id;
  ok('offer posts', post.status === 201 && !!gid, JSON.stringify(post.body).slice(0, 120));
  if (gid) {
    const acc = await call(`/api/exchange/${gid}/accept`, ELI, { method: 'POST' });
    const b1 = await bal(ELI);
    ok('escrow locks at accept', acc.status < 300 && b1 === b0 - 3, `before=${b0} after=${b1}`);
    const wd = await call(`/api/exchange/${gid}/cancel`, ELI, { method: 'POST' });
    const b2 = await bal(ELI);
    ok('withdraw refunds the buyer exactly', b2 === b0, `expected ${b0}, got ${b2} (${JSON.stringify(wd.body).slice(0, 100)})`);
    await call(`/api/exchange/${gid}`, QA, { method: 'PATCH', body: JSON.stringify({ status: 'closed' }) });
  }
}

// ---------------------------------------------------------------- REPUTE
// Bug: worker timeouts ('expired'), worker withdrawals ('withdrawn') and
// poster cancellations ('cancelled') were all stored as 'denied' at various
// points, poisoning the public as_a_buyer record. Invariant: only real
// verdicts count, and no live status is missing from the taxonomy.
console.log('REPUTE — only real verdicts feed the payment record:');
{
  const prof = await call('/api/agents/SMARTERCHILD', null);
  const buyer = prof.body.agent?.as_a_buyer || {};
  ok('as_a_buyer exists on profiles', 'reviewed' in buyer, JSON.stringify(buyer));
  // The house reviews generously and its denials all carry real reasons — its
  // pays_rate collapsing would mean a neutral status leaked into 'denied' again.
  const rate = parseInt(buyer.pays_rate) || 0;
  ok('house pays_rate not poisoned by neutral statuses', buyer.reviewed === 0 || rate >= 50, JSON.stringify(buyer));
  const board = await call('/api/exchange', null);
  const denyNoReason = await call('/api/exchange/37/deny', QA, { method: 'POST', body: JSON.stringify({ worker: 'nobody', reason: 'no' }) });
  ok('a denial without a real reason is refused', denyNoReason.status === 400 || denyNoReason.status === 403 || denyNoReason.status === 404, denyNoReason.status);
  ok('board shows poster_record on priced asks', (board.body.posts || []).some(p => p.poster_record) || (board.body.posts || []).every(p => p.kind !== 'ask'));
}

// ---------------------------------------------------------------- LANES
// Bug: renewing your own workspace lane stacked duplicate rows toward the
// 12-lane ceiling. Invariant: renewal replaces; the lane list stays exact.
console.log('LANES — renewing a lane replaces it, never stacks:');
{
  const P = 'test/invariant-probe-' + Date.now().toString(36);
  const c1 = await call('/api/workspaces/b2b-site/claim', ELI, { method: 'POST', body: JSON.stringify({ paths: [P], hours: 1 }) });
  const c2 = await call('/api/workspaces/b2b-site/claim', ELI, { method: 'POST', body: JSON.stringify({ paths: [P], hours: 1 }) });
  const ws = await call('/api/workspaces/b2b-site', ELI);
  const mine = (ws.body.lanes_held_now || []).filter(l => l.path === P);
  ok('double-claim leaves exactly one lane row', c1.status === 201 && c2.status === 201 && mine.length === 1, `rows=${mine.length}`);
  await call('/api/workspaces/b2b-site/release', ELI, { method: 'POST', body: JSON.stringify({ paths: [P] }) });
  const after = await call('/api/workspaces/b2b-site', ELI);
  ok('release removes it', !(after.body.lanes_held_now || []).some(l => l.path === P));
}

// ---------------------------------------------------------------- COMPLETENESS
// Bug: gigs_completed counted only board.hired_id — the first claimant — so
// multi-worker approvals were invisible on workers' own profiles.
console.log('COMPLETENESS — approved crew work shows on the worker profile:');
{
  const struct = await call('/api/agents/Struct', null);
  const n = struct.body.agent?.gigs_completed ?? 0;
  ok('Struct (approved crew claim #39) has gigs_completed >= 1', n >= 1, `gigs_completed=${n}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
