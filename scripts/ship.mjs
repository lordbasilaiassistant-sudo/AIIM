#!/usr/bin/env node
/**
 * THE DEPLOY GATE. `npm run ship` is the only sanctioned way to deploy AIIM:
 *
 *   1. syntax check              — a parse error never reaches wrangler
 *   2. pre-deploy BASELINE       — informational, never blocks: it records what
 *                                  prod scored BEFORE the change so post-deploy
 *                                  failures can be attributed (already-broken
 *                                  vs broken-by-us). Blocking here would forbid
 *                                  shipping any fix whose test was written
 *                                  first, which is backwards.
 *   3. stamp + deploy            — src/rev.js gets a unique stamp; wrangler's
 *                                  exit code is NOT trusted (the zone-routes
 *                                  call can fail after a successful upload)
 *   4. propagation PROOF         — poll /api/version until the stamp we wrote
 *                                  is the stamp being served. Deploy-landed is
 *                                  a fact, not an inference.
 *   5. FULL live suite           — every invariant, journey and money
 *                                  round-trip, against the code now serving.
 *
 * Red at step 5 exits 1 — "deployed" is not "shipped" until the suite says so.
 * No flag skips the tests; a gate with a bypass is a fence with a gate open.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const AIIM = process.env.AIIM_URL || 'https://aiim.broke2builtai.com';

const run = (name, cmd, args, opts = {}) => {
  console.log(`\n== ${name} ==`);
  // shell:true only for .cmd shims (npx); inline node scripts must never pass
  // through cmd.exe — it eats the `>` in `()=>` as a redirection operator.
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: cmd === 'npx' && process.platform === 'win32', ...opts });
  if (r.status !== 0) {
    console.error(`\nSHIP BLOCKED at "${name}" (exit ${r.status}). Nothing further ran.`);
    process.exit(r.status || 1);
  }
};

run('1/5 syntax', 'node', ['-e', "import('./src/index.js').then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})"]);

console.log('\n== 2/5 pre-deploy baseline (informational) ==');
{
  const r = spawnSync('node', ['test/run.mjs', 'fast'], { stdio: 'inherit', shell: false });
  console.log(r.status === 0
    ? '  baseline GREEN — any post-deploy red is OUR change.'
    : '  baseline RED — noted. Same tests red after deploy: the change did not fix them. NEW reds after deploy: the change broke them.');
}

console.log('\n== 3/5 stamp + deploy ==');
const STAMP = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + '-' + Math.random().toString(36).slice(2, 8);
fs.writeFileSync('src/rev.js', fs.readFileSync('src/rev.js', 'utf8').replace(/REV = '[^']*'/, `REV = '${STAMP}'`));
console.log(`  stamped rev ${STAMP}`);
{
  const r = spawnSync('npx', ['wrangler', 'deploy'], {
    encoding: 'utf8', shell: process.platform === 'win32', timeout: 300_000,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const uploaded = /Uploaded\s+aiim/i.test(out);
  console.log(out.split('\n').filter(l => /Uploaded|error|✘/i.test(l)).map(l => '  ' + l.trim()).join('\n'));
  if (!uploaded) {
    console.error('\nSHIP BLOCKED: wrangler never uploaded the worker. Full output above.');
    process.exit(1);
  }
  if (r.status !== 0) console.log('  (wrangler exit ≠ 0 but the upload succeeded — the zone-routes call is known-flaky; step 4 PROVES whether the code actually serves)');
}

console.log('\n== 4/5 propagation proof ==');
let live = false;
for (let i = 0; i < 36; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  try {
    const res = await fetch(`${AIIM}/api/version`, { signal: AbortSignal.timeout(10_000) });
    const j = await res.json().catch(() => ({}));
    if (j.rev === STAMP) { live = true; console.log(`  rev ${STAMP} is serving (poll ${i + 1})`); break; }
    if (i % 6 === 5) console.log(`  still serving ${j.rev || 'unknown'} (poll ${i + 1})`);
  } catch { /* POP not ready */ }
}
if (!live) {
  console.error(`SHIP BLOCKED: the stamped rev never appeared at /api/version after 3 minutes — the upload did NOT take effect. Investigate before claiming anything shipped.`);
  process.exit(1);
}

run('5/5 FULL live suite', 'node', ['test/run.mjs']);
console.log('\nSHIPPED: deployed AND verified green. That word means something here.');
