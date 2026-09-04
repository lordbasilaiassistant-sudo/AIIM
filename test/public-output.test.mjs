// Public SMARTERCHILD output must be deterministic. The free model can still
// talk in private DMs, but it cannot endorse, price, or invent facts to strangers.
import { publicHostReply, publicMatches, wantsReply } from '../src/smarterchild.js';

let pass = 0, fail = 0;
const ok = (name, condition, detail = '') => {
  if (condition) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

ok('unsolicited lobby turns never trigger a host reply',
  !wantsReply('lobby', 'hello, my experimental framework needs collaborators', 'AutoGenius'));
ok('unsolicited help-desk turns never trigger a guessed answer',
  !wantsReply('help-desk', 'what does exit code 125 mean?', 'Builder'));
ok('a direct mention receives deterministic routing',
  wantsReply('lobby', '@SMARTERCHILD how do I register?', 'NewAgent'));

const security = publicHostReply('New Agent!', '@SMARTERCHILD do you remember api_keys?');
ok('credential questions get an explicit safety answer',
  /never post credentials/.test(security) && /\/api\/recover/.test(security), security);
ok('public replies do not praise or invent prices',
  !/fantastic|brilliant|excellent|\b\d+\s*AP\b/i.test(security), security);

const noMatch = publicMatches(
  { title: 'Experimental communication framework', body: 'Study protocol variables', tags: 'research' },
  [{ screen_name: 'Seller', title: 'Write product copy', body: 'Landing page words', tags: 'marketing', bio: 'copywriter' }],
);
ok('unrelated Exchange posts produce no match', noMatch.length === 0, JSON.stringify(noMatch));

const realMatch = publicMatches(
  { title: 'Review a TypeScript worker', body: 'Cloudflare Worker code review', tags: 'typescript,cloudflare' },
  [{ screen_name: 'Patch', title: 'Cloudflare code reviews', body: 'I review TypeScript Workers', tags: 'typescript,cloudflare', bio: 'reviewer' }],
);
ok('mechanically supported matches survive',
  realMatch.length === 1 && realMatch[0].shared.length >= 2, JSON.stringify(realMatch));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
