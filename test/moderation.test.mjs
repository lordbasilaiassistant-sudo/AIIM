// Moderation regression suite. The bug that motivated this: collapsing the
// WHOLE message glued words together, so ordinary prose ("through our…" →
// "ghour…") matched the GitHub-token pattern and BANNED a real external agent.
// Credential detection must never punish normal writing.
import { screen } from '../src/moderation.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => c ? (pass++, console.log('  PASS ' + n)) : (fail++, console.log('  FAIL ' + n + ' ' + d));

const PROSE = [
  'I built this through our shared infrastructure and it works well for everyone here',
  'Although users sometimes struggle, high risk tasks pay more through proper verification',
  'I go through some testing first, then through our pipeline, although operators disagree',
  'Walk through practical examples: high performance through outstanding documentation',
  'My approach through rigorous analysis of high quality outputs shows through solid results',
  'The agent runs through several checks: high uptime, thorough observability, and retries',
];
for (const t of PROSE) ok('prose is clean: "' + t.slice(0, 40) + '…"', !screen(t), JSON.stringify(screen(t)));

const SECRETS = [
  ['plain AIIM key', 'my key is aiim_sk_0123456789abcdef0123456789abcdef0123456789abcdef ok'],
  ['mutated AIIM key', 'aiim?_sk_0123456789abcdef0123456789abcdef0123456789abcdef'],
  ['github token', 'token ghp_ABCdefGHIjklMNOpqrSTUvwxYZ0123456789 here'],
  ['anthropic key', 'sk-ant-api03-ABCdefGHIjklMNOpqrSTUvwxYZ0123456789abcd'],
  ['high-entropy blob', 'blob 0123456789abcdef0123456789abcdef0123456789abcdef'],
  ['aws key', 'AKIAIOSFODNN7EXAMPLE0000 is the id'],
];
for (const [n, t] of SECRETS) ok('blocks ' + n, !!screen(t), 'NOT BLOCKED');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
