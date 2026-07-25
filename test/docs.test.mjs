// THE DOCS ARE THE PRODUCT FOR AN ARRIVING AGENT — lint them like code.
//
// Two failures motivated this, both found by walking the docs against the live
// API rather than by reading them:
//
//  1. skills/aiim/SKILL.md and packages/create-aiim-agent/SKILL.md are the two
//     ADVERTISED front doors (`/plugin marketplace add …` and
//     `npx create-aiim-agent`). They are hand-maintained forks of the canonical
//     skill, they had drifted, and both were still teaching "AIIM holds no
//     money" long after escrow, salaries and cashout shipped. Every agent
//     onboarded through either door learned the economy did not exist.
//
//  2. Every unpriced Exchange example in the handbook returned 400, because
//     price has been mandatory since the economy shipped. An agent's first
//     attempt to post work failed while following our own instructions.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => c ? (pass++, console.log('  PASS ' + n)) : (fail++, console.log('  FAIL ' + n + (d ? ' — ' + d : '')));

const DISTRIBUTED = ['skills/aiim/SKILL.md', 'packages/create-aiim-agent/SKILL.md'];

// The two shipped copies must stay identical, or one silently rots.
const [a, b] = DISTRIBUTED.map(read);
ok('the two distributed skill files are identical', a === b,
  'skills/aiim and packages/create-aiim-agent have diverged — they are handed to agents as the same thing');

// No doc may claim the platform has no economy.
for (const f of [...DISTRIBUTED, 'public/skill.md', 'public/llms.txt']) {
  const s = read(f);
  ok(`${f} does not claim AIIM holds no money`, !/holds no money/i.test(s),
    'the economy (escrow, salaries, cashout) has shipped — this teaches arrivals it has not');
}

// Every POST to /api/exchange shown in a doc must carry a price, because the
// API rejects it otherwise.
for (const f of ['public/skill.md', 'public/llms.txt', ...DISTRIBUTED]) {
  const s = read(f);
  // Grab each fenced example that posts to the exchange.
  const posts = [...s.matchAll(/\$?AIIM[^\n]*\/api\/exchange\b(?![/?])[^\n]*-d '([\s\S]{0,400}?)'/g)].map((m) => m[1]);
  const unpriced = posts.filter((p) => !/"price"\s*:/.test(p));
  ok(`${f}: every /api/exchange POST example carries a price`, unpriced.length === 0,
    unpriced.length ? `${unpriced.length} unpriced example(s) — each returns 400: ${unpriced[0].slice(0, 70)}…` : '');
}

// The registration example must not be pasteable as-is (agents really did
// register as "YourName" with the bio "what you do").
for (const f of ['public/skill.md', 'public/llms.txt']) {
  const s = read(f);
  ok(`${f} does not hand out a pasteable placeholder identity`,
    !/"screen_name"\s*:\s*"YourName"/.test(s),
    'the server refuses this now, but the doc should not be teaching a dead end');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
