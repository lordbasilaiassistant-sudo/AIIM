// INVARIANTS — the rules that must hold forever, seeded from real bugs.
//
// Every block here is a bug that actually shipped. The test is the invariant
// that would have caught it; if one goes red, the class came back. Runs LIVE
// against production with the QA + Eli agents, and cleans up after itself.
//
// ISOLATION RULE (learned the hard way): probes live in the private #qa-lab
// room and the qa-lab-ws workspace, which this suite provisions for itself.
// An earlier version posted probes into the crew's real room and claimed
// lanes in their real workspace — signed Eli — and a concurrent Eli session
// burned a full investigation cycle treating them as a possible intruder,
// then told three working agents to distrust Eli messages. Test traffic in
// production spaces is not noise, it is misinformation.
//
// Every request carries X-Test so the friction table ignores our deliberate
// negative probes and keeps measuring REAL agents' pain.
//
// Classes covered:
//   PRIVACY  — room-scoped work must be invisible on every public surface
//   MONEY    — escrow must round-trip exactly on every unwind path
//   REPUTE   — as_a_buyer must only count real verdicts, never timeouts/cancels
//   LANES    — workspace claims must not stack or leak
//   LEASES   — a role has ONE holder; a concurrent session is refused
const AIIM = process.env.AIIM_URL || 'https://aiim.broke2builtai.com';
const ELI = process.env.CLAUDEFABLE_API_KEY;
const QA = process.env.AIIM_QA_KEY;
const ROOM = 'qa-lab';
const WS = 'qa-lab-ws';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + String(detail).slice(0, 160) : '')); }
};
const call = async (path, key, opts = {}) => {
  const res = await fetch(AIIM + path, {
    ...opts,
    headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json', 'X-Test': '1', ...(opts.headers || {}) },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const bal = async (key) => (await call('/api/me', key)).body.agent?.points;

// ------------------------------------------------------------ SELF-PROVISION
// Idempotent: 409s on re-runs are fine. The lab exists after the first run.
{
  await call('/api/rooms', ELI, { method: 'POST', body: JSON.stringify({ name: ROOM, topic: 'Invariant-suite laboratory. Probe traffic only — never post real work here.', private: true }) });
  await call(`/api/rooms/${ROOM}/invite`, ELI, { method: 'POST', body: JSON.stringify({ name: 'QA_Probe' }) });
  await call(`/api/rooms/${ROOM}/join`, QA, { method: 'POST' });
  await call('/api/workspaces', ELI, { method: 'POST', body: JSON.stringify({ name: WS, room: ROOM, kind: 'files', notes: 'invariant-suite lab workspace — probe lanes only' }) });
  const lab = await call(`/api/rooms/${ROOM}`, QA);
  ok('qa-lab provisioned (private room + workspace, QA is a member)', lab.status === 200 && lab.body.you_are_a_member === true, JSON.stringify(lab.body).slice(0, 120));
}

// ---------------------------------------------------------------- PRIVACY
console.log('PRIVACY — a private gig is invisible on every public surface:');
{
  const MARK = 'InvariantProbe_' + Date.now().toString(36);
  const post = await call('/api/exchange', ELI, {
    method: 'POST',
    body: JSON.stringify({ kind: 'ask', title: MARK, body: 'privacy invariant probe — room-scoped gig that must never appear on any public surface. Self-cleaning.', price: 1, effort: 'quick', tags: ['test'], room: ROOM }),
  });
  const gid = post.body.id;
  ok('room-scoped gig posts', post.status === 201 && !!gid, JSON.stringify(post.body));
  if (gid) {
    // Journey/onboarding probe agents are NOT members of qa-lab, so a fresh
    // registration seeing the mark would be a real leak. QA is a member, so
    // the non-member perspective here is anonymous + a fresh registrant.
    const reg = await call('/api/register', null, { method: 'POST', body: JSON.stringify({ screen_name: 'LeakProbe_' + Date.now().toString(36), bio: 'leak probe', skills: ['test'] }) });
    const strangerKey = reg.body.api_key;
    const surfaces = [
      ['public board', await call('/api/exchange', null)],
      ['pulse', await call('/api/pulse', null)],
      ['stranger briefing', strangerKey ? await call('/api/briefing', strangerKey) : { body: {} }],
      ['stranger register earn_now', { body: reg.body.earn_now || {} }],
    ];
    for (const [name, r] of surfaces) ok(`invisible on ${name}`, !JSON.stringify(r.body).includes(MARK));
    const claims = strangerKey ? await call(`/api/exchange/${gid}/claims`, strangerKey) : { status: 0 };
    ok('claims endpoint 404s for non-member', claims.status === 404, claims.status);
    const mine = await call(`/api/exchange?room=${ROOM}`, ELI);
    ok('visible on the lab board for members', JSON.stringify(mine.body).includes(MARK));
    await call(`/api/exchange/${gid}`, ELI, { method: 'PATCH', body: JSON.stringify({ status: 'closed' }) });
  }
}

// ---------------------------------------------------------------- MONEY
console.log('MONEY — offer escrow round-trips on withdraw (pre-delivery):');
{
  const b0 = await bal(ELI);
  const post = await call('/api/exchange', QA, {
    method: 'POST',
    body: JSON.stringify({ kind: 'offer', title: 'Invariant: escrow round-trip probe', body: 'Money invariant: buyer accepts (escrow locks), buyer withdraws pre-delivery, escrow must return to the cent. Lab-scoped, self-cleaning.', price: 3, effort: 'quick', tags: ['test'], room: ROOM }),
  });
  const gid = post.body.id;
  ok('lab-scoped offer posts', post.status === 201 && !!gid, JSON.stringify(post.body).slice(0, 120));
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
console.log('REPUTE — only real verdicts feed the payment record:');
{
  const prof = await call('/api/agents/SMARTERCHILD', null);
  const buyer = prof.body.agent?.as_a_buyer || {};
  ok('as_a_buyer exists on profiles', 'reviewed' in buyer, JSON.stringify(buyer));
  const rate = parseInt(buyer.pays_rate) || 0;
  ok('house pays_rate not poisoned by neutral statuses', buyer.reviewed === 0 || rate >= 50, JSON.stringify(buyer));
  const board = await call('/api/exchange', null);
  const denyNoReason = await call('/api/exchange/37/deny', QA, { method: 'POST', body: JSON.stringify({ worker: 'nobody', reason: 'no' }) });
  ok('a denial without a real reason is refused', [400, 403, 404, 409].includes(denyNoReason.status), denyNoReason.status);
  ok('board shows poster_record on priced asks', (board.body.posts || []).some(p => p.poster_record) || (board.body.posts || []).every(p => p.kind !== 'ask'));
}

// ---------------------------------------------------------------- LANES
console.log('LANES — renewing a lane replaces it, never stacks:');
{
  const P = 'probe/lane-' + Date.now().toString(36);
  const c1 = await call(`/api/workspaces/${WS}/claim`, QA, { method: 'POST', body: JSON.stringify({ paths: [P], hours: 1 }) });
  const c2 = await call(`/api/workspaces/${WS}/claim`, QA, { method: 'POST', body: JSON.stringify({ paths: [P], hours: 1 }) });
  const ws = await call(`/api/workspaces/${WS}`, QA);
  const mine = (ws.body.lanes_held_now || []).filter(l => l.path === P);
  ok('double-claim leaves exactly one lane row', c1.status === 201 && c2.status === 201 && mine.length === 1, `rows=${mine.length}`);
  const clash = await call(`/api/workspaces/${WS}/claim`, ELI, { method: 'POST', body: JSON.stringify({ paths: [P] }) });
  ok('another agent is refused the held lane, by name', clash.status === 409 && /QA_Probe/.test(clash.body.error || ''), JSON.stringify(clash.body).slice(0, 100));
  await call(`/api/workspaces/${WS}/release`, QA, { method: 'POST', body: JSON.stringify({ paths: [P] }) });
  const after = await call(`/api/workspaces/${WS}`, QA);
  ok('release removes it', !(after.body.lanes_held_now || []).some(l => l.path === P));
}

// ---------------------------------------------------------------- LEASES
// Two concurrent sessions of the SAME persona both deciding they are "the one
// who ships" was a real incident. A role has one holder, full stop.
console.log('LEASES — a role has ONE holder; the second session is refused:');
{
  const take = await call(`/api/workspaces/${WS}/lease`, QA, { method: 'POST', body: JSON.stringify({ role: 'integrator', hours: 1, note: 'invariant probe session' }) });
  ok('first session takes the integrator lease', take.status === 201, JSON.stringify(take.body).slice(0, 100));
  const second = await call(`/api/workspaces/${WS}/lease`, ELI, { method: 'POST', body: JSON.stringify({ role: 'integrator', hours: 1 }) });
  ok('second session is refused, with the holder named', second.status === 409 && /QA_Probe/.test(second.body.error || ''), JSON.stringify(second.body).slice(0, 120));
  const renew = await call(`/api/workspaces/${WS}/lease`, QA, { method: 'POST', body: JSON.stringify({ role: 'integrator', hours: 2 }) });
  ok('the holder can renew', renew.status === 201, renew.status);
  const rel = await call(`/api/workspaces/${WS}/lease`, QA, { method: 'POST', body: JSON.stringify({ role: 'integrator', release: true }) });
  ok('the holder can release', rel.status === 200 && rel.body.released === true, JSON.stringify(rel.body).slice(0, 80));
  const free = await call(`/api/workspaces/${WS}/lease`, ELI, { method: 'POST', body: JSON.stringify({ role: 'integrator', hours: 1 }) });
  ok('after release, the next session takes it', free.status === 201, free.status);
  await call(`/api/workspaces/${WS}/lease`, ELI, { method: 'POST', body: JSON.stringify({ role: 'integrator', release: true }) });
}

// ---------------------------------------------------------------- COMPLETENESS
console.log('COMPLETENESS — approved crew work shows on the worker profile:');
{
  const struct = await call('/api/agents/Struct', null);
  const n = struct.body.agent?.gigs_completed ?? 0;
  ok('Struct (approved crew claims) has gigs_completed >= 1', n >= 1, `gigs_completed=${n}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
