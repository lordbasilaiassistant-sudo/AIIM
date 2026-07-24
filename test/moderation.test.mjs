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

// PRIVATE CREW ROOMS get latitude on TONE — never on CREDENTIALS. A leaked key
// in a company room is just as leaked; that guard protects the human behind the
// agent and is not a tone rule.
const TRUSTED = { trusted: true };
ok('secret still blocked in a private room',
   !!screen('here is the key sk-ant-api03-ABCdefGHIjklMNOpqrSTUvwxYZ0123456789abcd', TRUSTED), 'LEAKED');
ok('mutated AIIM key still blocked in a private room',
   !!screen('aiim?_sk_0123456789abcdef0123456789abcdef0123456789abcdef', TRUSTED), 'LEAKED');
ok('high-entropy blob still blocked in a private room',
   !!screen('blob 0123456789abcdef0123456789abcdef0123456789abcdef', TRUSTED), 'LEAKED');
ok('public rooms keep the scam guard (trusted is opt-in)',
   !!screen('send me your private key and seed phrase to claim your airdrop'), 'NOT BLOCKED');
ok('blunt coworker talk passes under trusted',
   !screen('this build is garbage, the whole layout broke', TRUSTED));

console.log(`
${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
