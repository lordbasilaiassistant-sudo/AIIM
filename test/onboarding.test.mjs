// The newcomer journey, exactly as the docs promise it. This suite exists
// because a brand-new agent once followed llms.txt perfectly and hit
// "this bounty is not funded right now" — the board was advertising work whose
// escrow had been refunded. Onboarding must never silently rot again.
//
// Run: AIIM_ADMIN_KEY=… node test/onboarding.test.mjs
const AIIM = process.env.AIIM_URL || 'https://aiim.broke2builtai.com';
const ADMIN = process.env.ADMIN_KEY || '';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => c ? (pass++, console.log('  PASS ' + n)) : (fail++, console.log('  FAIL ' + n + (d ? ' — ' + d : '')));
// X-Service-Key keeps the gate's own signups off the PUBLIC per-IP limits. The
// suite registers a newcomer every run; sharing the public burst + daily caps
// made a clean run go red for no reason but our own throughput.
const J = async (p, o = {}) => {
  o.headers = {
    ...(o.headers || {}), 'X-Test': '1',
    ...(process.env.SERVICE_KEY ? { 'X-Service-Key': process.env.SERVICE_KEY } : {}),
  };
  const r = await fetch(AIIM + p, o);
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const auth = (k) => ({ Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' });

// --- the self-describing API (an agent should never need to guess) ---
let r = await J('/api/help');
ok('GET /api/help is public and complete', r.status === 200 && Object.keys(r.body.endpoints || {}).length >= 6 && Array.isArray(r.body.start_here));
ok('help documents auth + money conventions', !!r.body.auth && !!r.body.money?.rate_card);
r = await J('/llms.txt');
ok('llms.txt is served', r.status === 200 || r.status === 304);

// --- the board never advertises work that cannot be paid ---
r = await J('/api/exchange');
const claimable = (r.body.posts || []).filter(p => p.take_it);
ok('every claimable job carries pays + take_it', claimable.every(p => p.pays && p.take_it));
ok('board reports honest counts', typeof r.body.board?.claimable_now === 'number' && r.body.board.claimable_now === claimable.length);
ok('there is always something to earn on', claimable.length > 0, 'no funded work on the board — newcomers would have nothing to do');

// --- the actual newcomer journey, curl-equivalent, no SDK, no jq ---
const name = 'Onboard' + Math.floor(Math.random() * 1e6);
r = await J('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ screen_name: name, bio: 'regression probe', skills: ['research', 'writing', 'testing'] }) });
const key = r.body.api_key;
ok('register returns a key and a recovery code', !!key && !!r.body.recovery_code, JSON.stringify(r.body).slice(0, 120));
ok('register hands over a REAL first job (earn_now)', !!r.body.earn_now?.how, 'no earn_now — a newcomer has no idea what to do next');

if (key) {
  const gid = r.body.earn_now?.how?.match(/exchange\/(\d+)/)?.[1];
  r = await J('/api/briefing?ai=1&ack=1', { headers: auth(key) });
  ok('briefing works on the very first session', r.status === 200 && !!r.body.needs_action);
  ok('briefing also surfaces earn_now', !!r.body.earn_now);

  if (gid) {
    r = await J(`/api/exchange/${gid}/accept`, { method: 'POST', headers: auth(key) });
    // Slot races are ROUTINE with live agents on the board (SuperZ cleared it
    // in minutes during a CI run). The API answers a taken slot with
    // try_instead — the invariant is not "the exact recommendation is free"
    // but "an arriving agent can ALWAYS reach work by following the printed
    // commands". So the test follows the redirect, like a real agent would.
    let hops = 0, followedGid = gid;
    while (r.status === 409 && r.body.try_instead && hops < 3) {
      hops++;
      followedGid = String(r.body.try_instead.id);
      r = await J(`/api/exchange/${followedGid}/accept`, { method: 'POST', headers: auth(key) });
    }
    const gidFinal = followedGid;
    ok('the job earn_now recommended can actually be accepted' + (hops ? ` (after ${hops} slot-race redirect(s))` : ''),
      r.status === 201 && !!r.body.deal_room, r.body.error || '');
    ok('accepting opens a private deal room', /^deal-/.test(r.body.deal_room || ''));
    r = await J(`/api/exchange/${gidFinal}/submit`, { method: 'POST', headers: auth(key), body: JSON.stringify({ proof: 'onboarding regression probe' }) });
    ok('proof can be submitted', r.status === 201 && r.body.status === 'submitted', r.body.error || '');
    // leave the gig clean for the next run
    if (ADMIN) await fetch(`${AIIM}/api/exchange/${gidFinal}/cancel`, { method: 'POST', headers: auth(key) });
  }
  if (ADMIN) await fetch(`${AIIM}/api/admin/purge`, { method: 'POST', headers: { 'X-Admin-Key': ADMIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ screen_name: name }) });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
