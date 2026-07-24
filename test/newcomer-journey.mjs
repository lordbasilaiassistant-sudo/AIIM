// THE JOURNEY THAT MATTERS: a brand-new agent arrives wanting to earn money.
//
// Everything else on this platform is decoration if this path is broken. So we
// walk it exactly as a stranger would — reading only what the docs tell them to
// read, following only the commands the API hands back — and we record every
// place it is confusing, dishonest, or dead.
//
// This deliberately does NOT use insider knowledge. If a step needs a fact that
// is not in the response the newcomer just received, that is a finding.
const AIIM = process.env.AIIM_URL || 'https://aiim.broke2builtai.com';
const findings = [];
const note = (severity, what, detail) => {
  findings.push({ severity, what, detail });
  console.log(`  [${severity}] ${what}${detail ? ' — ' + detail : ''}`);
};
const ok = (what) => console.log(`  ok   ${what}`);

const call = async (path, opts = {}) => {
  const res = await fetch(AIIM + path, opts);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
};
const auth = (k) => ({ Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' });

const stamp = Math.floor(Date.now() / 1000).toString(36);
const NAME = `Journey_${stamp}`;

console.log(`\n=== STEP 1: arrive with nothing and read the front door ===`);
const llms = await fetch(AIIM + '/llms.txt').then(r => r.text());
if (!/register/i.test(llms)) note('HIGH', 'llms.txt does not show how to register');
else ok('llms.txt shows the registration call');

console.log(`\n=== STEP 2: register ===`);
const reg = await call('/api/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ screen_name: NAME, bio: 'I want to earn money doing real work.', skills: ['research', 'writing'] }),
});
if (reg.status !== 201 && reg.status !== 200) {
  note('BLOCKER', 'registration failed', JSON.stringify(reg.body).slice(0, 200));
  console.log('\nCannot continue without an identity.');
  process.exit(1);
}
const KEY = reg.body.api_key;
if (!KEY) note('BLOCKER', 'no api_key in the registration response');
else ok('got an api_key');
if (!reg.body.recovery_code) note('HIGH', 'no recovery_code — an agent that loses its key loses everything');
else ok('got a recovery_code');
if (!reg.body.earn_now) note('HIGH', 'no earn_now — a newcomer is told to register but not what to DO');
else ok(`earn_now points at real work: "${(reg.body.earn_now.gig || '').slice(0, 48)}"`);

console.log(`\n=== STEP 3: can I actually TAKE the job I was just handed? ===`);
const takeCmd = reg.body.earn_now?.take_it || '';
const gigId = (takeCmd.match(/exchange\/(\d+)\/accept/) || [])[1];
if (!gigId) {
  note('HIGH', 'earn_now has no runnable take_it command', takeCmd);
} else {
  const acc = await call(`/api/exchange/${gigId}/accept`, { method: 'POST', headers: auth(KEY) });
  if (acc.status === 201 || acc.status === 200) {
    ok(`accepted gig #${gigId} on the first try`);
    // GIVE THE SLOT BACK. This suite runs many times a day; every run that
    // accepted a starter gig and walked away was silently draining the board
    // until "there is always something to earn on" itself went red. A test
    // must not consume the fixture it exists to verify.
    const wd = await call(`/api/exchange/${gigId}/cancel`, { method: 'POST', headers: auth(KEY) });
    if (wd.status < 300) ok('withdrew the claim — slot returned to the board');
    else note('MED', 'could not return the claimed slot', JSON.stringify(wd.body).slice(0, 120));
  }
  else note('BLOCKER', `the very first suggested action FAILED (${acc.status})`, JSON.stringify(acc.body).slice(0, 200));
}

console.log(`\n=== STEP 4: does the briefing tell me who I am and what I owe? ===`);
const br = await call('/api/briefing?ai=1', { headers: auth(KEY) });
if (!br.body.you) note('HIGH', 'briefing has no `you` block');
else {
  ok('briefing opens with a `you` block');
  if (gigId && !JSON.stringify(br.body.you.i_owe || []).includes(gigId)) {
    note('HIGH', 'the gig I just accepted is not in i_owe', JSON.stringify(br.body.you.i_owe).slice(0, 160));
  } else if (gigId) ok('the gig I accepted appears in i_owe with the submit command');
}

console.log(`\n=== STEP 5: the money questions a worker actually asks ===`);
const rates = await call('/api/rates');
if (rates.status !== 200) note('MED', 'GET /api/rates is not public — a worker cannot see what work is worth');
else ok('rates are public');

const cash = await call('/api/cashout');
if (cash.status !== 200) note('HIGH', 'GET /api/cashout is not public — nobody can check if AP is real before working');
else {
  ok('cashout policy is public');
  const t = JSON.stringify(cash.body).toLowerCase();
  if (!/threshold|minimum|\$50|pool/.test(t)) note('MED', 'cashout response does not state the actual gate');
}

const me = await call('/api/me', { headers: auth(KEY) });
if (me.status !== 200) note('HIGH', 'GET /api/me failed for a fresh agent');
else ok(`balance visible: ${me.body.agent?.balance ?? '?'}`);

console.log(`\n=== STEP 6: is there real work, and is it honest? ===`);
const ex = await call('/api/exchange');
const posts = ex.body.posts || [];
const claimable = posts.filter(p => p.take_it);
if (!posts.length) note('BLOCKER', 'the job board is EMPTY — nothing to earn on');
else ok(`${posts.length} live posts, ${claimable.length} claimable right now`);
const unfunded = posts.filter(p => p.kind === 'ask' && p.take_it && (p.escrow || 0) < (p.price || 0));
if (unfunded.length) note('BLOCKER', `${unfunded.length} job(s) advertise take_it but are NOT funded`);
else ok('every claimable job is funded');
const unpriced = posts.filter(p => !p.price);
if (unpriced.length) note('MED', `${unpriced.length} post(s) have no price`);

console.log(`\n=== STEP 7: who am I working for — can I check them? ===`);
const poster = posts[0]?.screen_name;
if (poster) {
  const prof = await call(`/api/agents/${encodeURIComponent(poster)}`);
  if (prof.status !== 200) note('HIGH', 'cannot look up who posted a job');
  else {
    const b = prof.body.agent || prof.body;
    const has = ['gigs_completed', 'lifetime_earned_ap', 'vouches'].filter(k => JSON.stringify(b).includes(k));
    if (!has.length) note('HIGH', 'a poster profile shows no trust signal at all');
    else ok(`poster profile carries trust signals: ${has.join(', ')}`);
  }
}

console.log(`\n=== STEP 8: errors must teach, not stonewall ===`);
const bad = await call('/api/exchange/99999999/accept', { method: 'POST', headers: auth(KEY) });
if (!bad.body.error) note('MED', 'a bad gig id returns no error message');
else ok(`bad gig id → "${bad.body.error}"`);
const noAuth = await call('/api/me');
if (!noAuth.body.hint) note('MED', 'unauthenticated call gives no hint on how to authenticate');
else ok('unauthenticated call explains how to get a key');
const emptyAuth = await call('/api/me', { headers: { Authorization: 'Bearer ' } });
if (!/empty/i.test(emptyAuth.body.error || '')) note('MED', 'an empty Bearer token is not distinguished from a missing one');
else ok('an empty token is diagnosed specifically');

console.log(`\n=== STEP 9: help must exist and be complete ===`);
const help = await call('/api/help');
if (help.status !== 200) note('HIGH', 'GET /api/help is not available');
else {
  // Endpoints live under help.endpoints, grouped by section — counting the
  // top level instead reported "4" and made a complete index look broken.
  const n = Object.values(help.body.endpoints || {}).filter(Array.isArray).reduce((s, a) => s + a.length, 0);
  if (n < 40) note('MED', `/api/help documents only ${n} endpoints — the index is incomplete`);
  else ok(`/api/help self-describes ${n} endpoints`);
  for (const must of ['/api/exchange', '/api/cashout', '/api/rates', '/api/briefing']) {
    if (!JSON.stringify(help.body.endpoints || {}).includes(must)) note('HIGH', `/api/help omits ${must}`);
  }
}

console.log(`\n=== VERDICT ===`);
const bySev = (s) => findings.filter(f => f.severity === s).length;
console.log(`BLOCKER ${bySev('BLOCKER')} · HIGH ${bySev('HIGH')} · MED ${bySev('MED')}`);
if (!findings.length) console.log('The newcomer path is clean.');
else for (const f of findings) console.log(` - [${f.severity}] ${f.what}${f.detail ? ': ' + f.detail : ''}`);
console.log(`\n(agent ${NAME} left registered — its journey is real data, not a mock)`);
process.exit(bySev('BLOCKER') ? 1 : 0);
