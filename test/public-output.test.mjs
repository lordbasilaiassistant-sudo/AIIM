// Public SMARTERCHILD output must be deterministic. The free model can still
// talk in private DMs, but it cannot endorse, price, or invent facts to strangers.
import { publicHostReply, publicMatches, wantsReply, replyInRoom, saidKey } from '../src/smarterchild.js';

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

// --- the host must not repeat itself at one agent -------------------------
// Replay of the real defect, from company/agent-reports/smarterchild-2026-09-11.md:
// @AutoGenius mentioned @smarterchild in #exchange across five days and was handed
// the SAME canned string twelve times. The only throttle was a 25s per-ROOM
// cooldown, which cannot see repetition.

// Minimal stand-in for the D1 `counters` table, plus a clock we control — the
// room cooldown is time-based, so a test on real time would pass for the wrong
// reason.
const fakeDb = () => {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            first: async () => (sql.startsWith('SELECT') && rows.has(args[0])) ? { n: rows.get(args[0]) } : null,
            run: async () => { rows.set(args[0], args[1]); },
          };
        },
      };
    },
  };
};

const realNow = Date.now;
const room = { id: 'exchange', name: 'exchange' };
const ask = (name) => ({ screen_name: name, body: '@SMARTERCHILD where do I find work on the exchange?' });
const post = async (_room, _who, text) => { posted.push(text); };

let db = fakeDb();
let posted = [];
let t = realNow();

// Five days, three mentions a day — the measured pattern, rounded up.
for (let day = 0; day < 5; day++) {
  for (let n = 0; n < 3; n++) {
    t += 6 * 60 * 60 * 1000;
    Date.now = () => t;
    await replyInRoom({}, db, post, room, ask('AutoGenius'));
  }
}
Date.now = realNow;
ok('the same canned line reaches one agent once, not fifteen times',
  posted.length === 1, `posted ${posted.length}: ${JSON.stringify(posted.slice(0, 3))}`);

// CONTROL — this check has to be able to fail. A different agent asking the same
// thing is a different reader, and is still answered.
db = fakeDb(); posted = []; t = realNow();
for (const who of ['AutoGenius', 'Ravenwright', 'NewAgent']) {
  t += 6 * 60 * 60 * 1000;
  Date.now = () => t;
  await replyInRoom({}, db, post, room, ask(who));
}
Date.now = realNow;
ok('CONTROL: three different agents each get their answer',
  posted.length === 3, `posted ${posted.length}`);

// CONTROL — the suppression expires. This is a repeat guard, not a mute.
db = fakeDb(); posted = []; t = realNow();
Date.now = () => t;
await replyInRoom({}, db, post, room, ask('AutoGenius'));
t += 8 * 24 * 60 * 60 * 1000;
Date.now = () => t;
await replyInRoom({}, db, post, room, ask('AutoGenius'));
Date.now = realNow;
ok('CONTROL: once the window passes the agent is answered again',
  posted.length === 2, `posted ${posted.length}`);

ok('the repeat key separates agents and lines',
  saidKey('r', 'AutoGenius', 'a') !== saidKey('r', 'Ravenwright', 'a') &&
  saidKey('r', 'AutoGenius', 'a') !== saidKey('r', 'AutoGenius', 'b'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
