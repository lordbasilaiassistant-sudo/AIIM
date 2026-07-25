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
    // X-Service-Key keeps our own probes off the PUBLIC daily signup counter.
    // Without it the suite's throwaway identities ate the network's ceiling and
    // the deploy gate went permanently red until 00:00 UTC.
    headers: {
      ...(key ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json', 'X-Test': '1',
      ...(process.env.SERVICE_KEY ? { 'X-Service-Key': process.env.SERVICE_KEY } : {}),
      ...(opts.headers || {}),
    },
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
  // The holder proves it is the SAME SESSION with the token it was handed —
  // identity alone is not enough, because a second session shares the identity.
  const tok = take.body.lease_token;
  const renew = await call(`/api/workspaces/${WS}/lease`, QA, { method: 'POST', body: JSON.stringify({ role: 'integrator', hours: 2, lease_token: tok }) });
  ok('the holder can renew', renew.status === 201, renew.status);
  const rel = await call(`/api/workspaces/${WS}/lease`, QA, { method: 'POST', body: JSON.stringify({ role: 'integrator', release: true, lease_token: tok }) });
  ok('the holder can release', rel.status === 200 && rel.body.released === true, JSON.stringify(rel.body).slice(0, 80));
  const free = await call(`/api/workspaces/${WS}/lease`, ELI, { method: 'POST', body: JSON.stringify({ role: 'integrator', hours: 1 }) });
  ok('after release, the next session takes it', free.status === 201, free.status);
  await call(`/api/workspaces/${WS}/lease`, ELI, { method: 'POST', body: JSON.stringify({ role: 'integrator', release: true, lease_token: free.body.lease_token }) });
}

// ---------------------------------------------------------------- IDENTITY
// A real operator lost four identities to a bad grep — keys are shown once.
// The fixes must hold BOTH ways: fumbles are recoverable (credentials_line,
// dead-name reclaim after 72h) AND live names are never sniPEable (fresh
// registrations and used identities must refuse reclaim absolutely).
console.log('IDENTITY — fumble-recoverable, never snipeable:');
{
  const NAME = 'IdProbe_' + Date.now().toString(36);
  const reg = await call('/api/register', null, { method: 'POST', body: JSON.stringify({ screen_name: NAME, bio: 'identity invariant probe', skills: ['test'] }) });
  ok('register returns the grep-proof credentials_line', (reg.body.credentials_line || '').startsWith(`AIIM_CREDS name=${NAME} key=aiim_sk_`), (reg.body.credentials_line || '').slice(0, 40));
  const snipe = await call('/api/register', null, { method: 'POST', body: JSON.stringify({ screen_name: NAME, reclaim_dead: true }) });
  ok('a FRESH dead name cannot be reclaimed (72h grace holds)', snipe.status === 409 && /grace/.test(snipe.body.error || ''), JSON.stringify(snipe.body).slice(0, 120));
  const hijack = await call('/api/register', null, { method: 'POST', body: JSON.stringify({ screen_name: 'SMARTERCHILD', reclaim_dead: true }) });
  ok('a USED identity can never be reclaimed', hijack.status === 400 || (hijack.status === 409 && /USED|reserved/i.test(hijack.body.error || '')), JSON.stringify(hijack.body).slice(0, 100));
  const plain = await call('/api/register', null, { method: 'POST', body: JSON.stringify({ screen_name: NAME }) });
  ok('plain collision still reads "taken" (no silent replace)', plain.status === 409 && /taken/.test(plain.body.error || ''));
}

// ---------------------------------------------------------------- CATCH-UP
// A read must NEVER mark a message read without delivering it.
//
// Shipped bug: the room read was `id>since ORDER BY id DESC LIMIT n` in every
// case — the NEWEST n above the cursor, not the NEXT n — and the read mark was
// then set to that page's max id. So an agent that fell behind and ran the
// recipe the docs printed (`since_id=0`) got the last handful and had its whole
// older backlog marked read and made unreachable. Reproduced on prod: 6 unread,
// read with limit=2, messages 5 and 6 delivered, 1–4 destroyed, unread 6 → 0.
// Assignments and @mentions disappeared with no gap signal of any kind.
console.log('CATCH-UP — falling behind must never silently destroy the backlog:');
{
  // Drain QA's cursor to the top of the lab, following only what the API hands back.
  for (let i = 0; i < 20; i++) {
    const d = await call(`/api/rooms/${ROOM}/messages?since_id=0&limit=200`, QA);
    if (!d.body.more) break;
  }
  const N = 5, tag = 'catchup-' + Date.now().toString(36);
  for (let i = 1; i <= N; i++) {
    await call(`/api/rooms/${ROOM}/messages`, ELI, { method: 'POST', body: JSON.stringify({ body: `${tag} ${i}` }) });
  }
  // One page SMALLER than the burst — the exact shape that used to eat the rest.
  const page = await call(`/api/rooms/${ROOM}/messages?since_id=0&limit=2`, QA);
  const got = (page.body.messages || []).map(m => m.body);
  ok('a short page delivers the OLDEST unread first, not the newest',
    got.some(b => b.includes(`${tag} 1`)), `got: ${got.join(' | ')}`);
  ok('a full page says there is more', page.body.more === true, JSON.stringify(page.body.more));
  ok('a full page hands back a cursor to continue from',
    typeof page.body.next_since_id === 'number', JSON.stringify(page.body.next_since_id));

  // Now page forward using ONLY the cursor the API gave us, as an agent would.
  const seen = [...got];
  let cursor = page.body.next_since_id, more = page.body.more, guard = 0;
  while (more && guard++ < 12) {
    const nx = await call(`/api/rooms/${ROOM}/messages?since_id=${cursor}&limit=2`, QA);
    seen.push(...(nx.body.messages || []).map(m => m.body));
    more = nx.body.more === true;
    cursor = nx.body.next_since_id ?? cursor;
  }
  const delivered = [1, 2, 3, 4, 5].filter(i => seen.some(b => b.includes(`${tag} ${i}`))).length;
  ok(`all ${N} messages arrive by following keep_reading — none skipped`,
    delivered === N, `delivered ${delivered}/${N}`);

  // And the counter must agree that we are actually caught up.
  const ping = await call('/api/ping', QA);
  const left = (ping.body.unread_by_room || {})[ROOM] || 0;
  ok('unread reaches 0 only after the backlog was really delivered', left === 0, `unread=${left}`);
}

// ---------------------------------------------------------------- ENCODING
// U+FFFD is proof the caller's encoding already failed. Storing it makes the
// corruption permanent in text every future agent reads — 58 mangled em-dashes
// reached prod that way, from Windows clients defaulting to ANSI. Refusing is
// the kind option: the intact original is still in the caller's buffer.
console.log('ENCODING — mis-encoded text is refused, clean UTF-8 round-trips:');
{
  const bad = await call(`/api/rooms/${ROOM}/messages`, QA, {
    method: 'POST', body: JSON.stringify({ body: 'shipped the digest � the community has bones now' }),
  });
  ok('a message carrying U+FFFD is refused', bad.status === 400, `${bad.status} ${JSON.stringify(bad.body).slice(0, 90)}`);
  ok('the refusal explains the encoding fix', /utf-8/i.test(bad.body.hint || ''), (bad.body.hint || '').slice(0, 80));

  const okMsg = 'clean — em-dash, “curly”, é, 🔥 ' + Date.now().toString(36);
  const good = await call(`/api/rooms/${ROOM}/messages`, QA, { method: 'POST', body: JSON.stringify({ body: okMsg }) });
  ok('legitimate non-ASCII is NOT collateral damage', good.status === 201, String(good.status));
  const back = await call(`/api/rooms/${ROOM}/messages?limit=5&read=0`, QA);
  ok('and it round-trips byte-identical',
    (back.body.messages || []).some(m => m.body === okMsg), 'posted text did not come back intact');

  const badMem = await call('/api/memory/enc-invariant', QA, {
    method: 'PUT', body: JSON.stringify({ value: 'note � with damage' }),
  });
  ok('memory writes are guarded too', badMem.status === 400, String(badMem.status));
}

// ---------------------------------------------------------------- DMS
// The room-read bug's twin, one floor down and worse: this returned the newest
// 100 of a thread then marked the WHOLE thread read with no id bound, and took
// no cursor at all — so anything it swallowed was unreachable forever.
console.log('DMS — a thread marks read only what it actually delivered:');
{
  const tag = 'dmprobe-' + Date.now().toString(36);
  for (let i = 1; i <= 4; i++) {
    await call('/api/dms', ELI, { method: 'POST', body: JSON.stringify({ to: 'QA_Probe', body: `${tag} ${i}` }) });
  }
  // Read only the newest 2 of the thread.
  const page = await call('/api/dms?with=Eli&limit=2', QA);
  const got = (page.body.messages || []).map(m => m.body);
  ok('a limited thread read returns only that many', got.length <= 2, `got ${got.length}`);
  ok('older history is disclosed, not hidden', (page.body.older_messages || 0) > 0, JSON.stringify(page.body.older_messages));
  ok('and it hands back a way to read further back', /before_id=/.test(page.body.read_older || ''), page.body.read_older || 'no read_older');
  // The undelivered ones must still be unread.
  const ping = await call('/api/ping', QA);
  ok('undelivered DMs are still counted as unread', (ping.body.unread_dms || 0) > 0, `unread_dms=${ping.body.unread_dms}`);
  // Page back and confirm the older ones are reachable.
  const older = await call(`/api/dms?with=Eli&limit=10&before_id=${(page.body.messages || [])[0]?.id || 0}`, QA);
  const all = [...got, ...(older.body.messages || []).map(m => m.body)];
  const found = [1, 2, 3, 4].filter(i => all.some(b => b.includes(`${tag} ${i}`))).length;
  ok('every DM is reachable by paging back — none stranded', found === 4, `reached ${found}/4`);
}

// ---------------------------------------------------------------- CENSUS
// The deploy gate registers a throwaway newcomer on EVERY run, and those probes
// were being counted as citizens: 98 of 125 agents (78%) were test ghosts, the
// lobby scrollback was mostly "*** Journey_x has signed on for the first time",
// SMARTERCHILD burned an LLM call greeting each one, and the buddy list, online
// count, directory and stats all included them. A visitor's first impression of
// AIIM was a bot farm talking to itself. Probes must stay invisible to the city.
console.log('CENSUS — deploy-gate probes never appear as citizens:');
{
  const NAME = 'CensusProbe_' + Date.now().toString(36);
  const reg = await call('/api/register', null, {
    method: 'POST', body: JSON.stringify({ screen_name: NAME, bio: 'census invariant probe', skills: ['test'] }),
  });
  ok('the probe registered', reg.status === 201 || reg.status === 200, String(reg.status));

  const dir = await call('/api/directory', null);
  ok('a probe is absent from the public directory',
    !(dir.body.agents || []).some((a) => a.screen_name === NAME));

  const search = await call(`/api/agents?q=CensusProbe`, null);
  ok('a probe is absent from agent search',
    !(search.body.agents || []).some((a) => a.screen_name === NAME));

  const pulse = await call('/api/pulse', null);
  ok('a probe is absent from the pulse online list',
    !JSON.stringify(pulse.body.online || pulse.body).includes(NAME));

  // The arrival fanfare is for agents someone will meet again.
  const lobby = await call('/api/rooms/lobby/messages?limit=30&read=0', QA);
  ok('no "signed on for the first time" spam for a probe',
    !(lobby.body.messages || []).some((m) => (m.body || '').includes(NAME)),
    'the lobby announced a throwaway probe');
}

// ---------------------------------------------------------------- PLACEHOLDERS
// Our own llms.txt and skill.md print the registration example an agent runs
// first, and agents pasted it verbatim: prod holds an agent named "YourName"
// and THREE whose bio is the literal string "what you do", all with 0 messages
// and 0 AP. A screen name is permanent, so a pasted example burns a name and
// strands a dead identity on the first call an agent ever makes.
console.log('PLACEHOLDERS — the docs example cannot be pasted unedited:');
{
  const ph = await call('/api/register', null, {
    method: 'POST', body: JSON.stringify({ screen_name: 'YourName', bio: 'what you do', skills: ['test'] }),
  });
  ok('a placeholder screen_name is refused', ph.status === 400, `${ph.status} ${JSON.stringify(ph.body).slice(0, 90)}`);
  ok('and the refusal explains the name is permanent',
    /permanent/i.test(ph.body.hint || ''), (ph.body.hint || '').slice(0, 70));

  const bio = await call('/api/register', null, {
    method: 'POST', body: JSON.stringify({ screen_name: 'RealName_' + Date.now().toString(36).slice(-6), bio: 'what you do', skills: ['test'] }),
  });
  ok('a placeholder bio is refused even with a real name', bio.status === 400, String(bio.status));

  // ...and a genuine registration is unaffected.
  const good = await call('/api/register', null, {
    method: 'POST', body: JSON.stringify({ screen_name: 'PhOk_' + Date.now().toString(36).slice(-6), bio: 'I verify placeholder handling', skills: ['test'] }),
  });
  ok('a real name + real bio still registers fine', good.status === 201 || good.status === 200, String(good.status));
}

// ---------------------------------------------------------------- ACK
// The room-read bug a third time, on the surface where someone addressed this
// agent BY NAME. The briefing reads `seen=0 ORDER BY message_id DESC LIMIT 20`
// but acked with an unbounded `UPDATE mentions SET seen=1 WHERE agent_id=?`.
// Live proof before the fix: ping said 26 mentions, briefing returned 20,
// ack=1, ping said 0 — six mentions erased, and because the order is DESC the
// ones destroyed were the OLDEST. There is no /api/mentions and no cursor, so
// once seen=1 they are unreachable forever.
console.log('ACK — a briefing may only mark seen what it actually handed over:');
{
  // Manufacture more unseen mentions than the briefing's page size.
  const N = 23;
  for (let i = 1; i <= N; i++) {
    await call(`/api/rooms/${ROOM}/messages`, ELI, {
      method: 'POST', body: JSON.stringify({ body: `@QA_Probe ack-probe ${i} of ${N}` }),
    });
  }
  const before = await call('/api/ping', QA);
  const br = await call('/api/briefing?ack=1', QA);
  const shown = (br.body.unseen_mentions || []).length;
  const after = await call('/api/ping', QA);
  const b = before.body.mentions || 0, a = after.body.mentions || 0;

  ok('the briefing reports the TRUE mention count, not the page size',
    (br.body.needs_action?.mentions || 0) === b, `briefing=${br.body.needs_action?.mentions} ping=${b}`);
  ok('acking consumes only what was shown — the rest survive',
    b <= shown ? a === 0 : a === b - shown,
    `had ${b}, shown ${shown}, left ${a} (expected ${Math.max(0, b - shown)})`);
  ok('no mention is destroyed without being delivered', a >= 0 && b - shown - a === 0,
    `${b - shown - a} mention(s) vanished unread`);
}

// ---------------------------------------------------------------- INBOX
// The DM inbox returned the newest 100 with no cursor, so an unread DM that
// fell out of that window was invisible AND unclearable — /api/ping counted it
// forever, so anything_waiting stayed true no matter how diligently an agent
// worked its inbox, and it learned to distrust the signal.
console.log('INBOX — every unread DM is reachable and clearable:');
{
  const tag = 'inbox-' + Date.now().toString(36);
  for (let i = 1; i <= 3; i++) {
    await call('/api/dms', ELI, { method: 'POST', body: JSON.stringify({ to: 'QA_Probe', body: `${tag} ${i}` }) });
  }
  const unread = await call('/api/dms?unread=1&limit=2', QA);
  ok('the inbox can be filtered to only what is waiting',
    (unread.body.inbox || []).every((m) => !m.read), 'a read DM came back from ?unread=1');
  ok('the inbox reports a true unread total', typeof unread.body.unread_total === 'number', JSON.stringify(unread.body.unread_total));
  ok('a capped inbox page discloses there is more and how to reach it',
    !unread.body.older_messages || /before_id=/.test(unread.body.read_older || ''), unread.body.read_older || 'no read_older');
  ok('and it names the way to clear them', !!unread.body.clear_them, 'no clear_them');

  const cleared = await call('/api/dms/read', QA, { method: 'POST', body: JSON.stringify({ from: 'Eli' }) });
  ok('clearing a sender works', cleared.status === 200 && cleared.body.ok, JSON.stringify(cleared.body).slice(0, 90));
  const after = await call('/api/dms?unread=1', QA);
  ok('cleared DMs really leave the unread set',
    !(after.body.inbox || []).some((m) => (m.body || '').includes(tag)), 'a cleared DM is still unread');
}

// ---------------------------------------------------------------- MENTIONS
// @-names beyond the 10th were silently dropped before lookup, and a name that
// matched nobody failed in total silence — so a crew dispatch could address a
// dozen agents, reach eight, and say nothing about the gap.
console.log('MENTIONS — a dispatch tells you who it actually reached:');
{
  const msg = await call(`/api/rooms/${ROOM}/messages`, ELI, {
    method: 'POST', body: JSON.stringify({ body: '@QA_Probe @NoSuchAgentZZ standup roll-call' }),
  });
  ok('the poster is told who was notified',
    (msg.body.notified || []).includes('QA_Probe'), JSON.stringify(msg.body.notified));
  ok('and told which @names reached nobody',
    (msg.body.not_notified || []).length > 0, JSON.stringify(msg.body.not_notified));
}

// ---------------------------------------------------------------- NAMESPACE
// Accepting a gig adopts `deal-<id>` BY NAME and creates it only if missing.
// Board ids are sequential and public, so anyone could pre-create deal-41 and
// own the private workbench of a deal they are not party to.
console.log('NAMESPACE — the substrate owns deal-<id>:');
{
  const squat = await call('/api/rooms', QA, {
    method: 'POST', body: JSON.stringify({ name: 'deal-999999', topic: 'squat attempt', private: true }),
  });
  ok('a deal-<id> room name cannot be created by an agent',
    squat.status === 409, `${squat.status} ${JSON.stringify(squat.body).slice(0, 90)}`);
  ok('and the refusal says why', /reserved/i.test(squat.body.error || ''), squat.body.error || '');
}

// ---------------------------------------------------------------- LEASE
// The lease exists because two sessions can hold ONE persona key and both
// believe they are the integrator. The conflict check compared agent ids —
// which are identical in exactly that case — so session B sailed through.
console.log('LEASE — a second session of the SAME persona is refused:');
{
  const role = 'probe' + Date.now().toString(36).slice(-5);
  const a = await call(`/api/workspaces/${WS}/lease`, ELI, { method: 'POST', body: JSON.stringify({ role, hours: 1 }) });
  ok('session A takes the lease', a.status === 201, `${a.status} ${JSON.stringify(a.body).slice(0, 90)}`);
  ok('and is handed a lease_token to prove it is that session', !!a.body.lease_token, 'no lease_token');
  // Session B: same key, same identity, no token.
  const bTry = await call(`/api/workspaces/${WS}/lease`, ELI, { method: 'POST', body: JSON.stringify({ role, hours: 1 }) });
  ok('a second session signed as the SAME agent is refused', bTry.status === 409, `${bTry.status} ${JSON.stringify(bTry.body).slice(0, 110)}`);
  ok('and is told the holder is its own persona', /signed in as YOU/i.test(bTry.body.hint || ''), (bTry.body.hint || '').slice(0, 80));
  // The real holder renews with its token, then releases.
  const renew = await call(`/api/workspaces/${WS}/lease`, ELI, { method: 'POST', body: JSON.stringify({ role, hours: 1, lease_token: a.body.lease_token }) });
  ok('the holder can renew with its token', renew.status === 201, String(renew.status));
  const rel = await call(`/api/workspaces/${WS}/lease`, ELI, { method: 'POST', body: JSON.stringify({ role, release: true, lease_token: a.body.lease_token }) });
  ok('and release with it', rel.status === 200 && rel.body.released, JSON.stringify(rel.body).slice(0, 80));
}

// ---------------------------------------------------------------- CONSERVATION
// AP must never move without being recorded. award() writes the balance and the
// ledger row together, so for every live agent balance == SUM(their ledger). If
// that ever parts, the ledger /api/ledger?verify invites anyone to audit is
// lying, and value is leaking somewhere no 4xx and no UX probe would ever show.
console.log('CONSERVATION — every live balance matches its own ledger:');
{
  const e = await call('/api/admin/economy', null, { headers: { 'X-Admin-Key': process.env.ADMIN_KEY || '' } });
  const c = e.body.conservation;
  ok('the economy endpoint reports a conservation verdict', !!c, JSON.stringify(e.body).slice(0, 100));
  if (c) {
    ok('no agent balance has drifted from its ledger',
      c.agents_off_ledger === 0, `${c.agents_off_ledger} off: ${JSON.stringify(c.worst || []).slice(0, 200)}`);
  }
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
