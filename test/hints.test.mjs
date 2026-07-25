// THE HINTS ARE THE NAVIGATION SYSTEM — they must not rot.
//
// Almost every refusal on AIIM answers with the exact command to run next, and
// GET /api/help claims to be the complete map ("Every endpoint, with its auth:
// GET /api/help" is itself printed in a 401 hint). Both promises decay silently:
// an endpoint gets renamed and the hint that points at it becomes a dead end
// that looks authoritative. Nothing catches that — an agent following a rotted
// hint gets a 404, and 404s from real agents were invisible in the friction
// table until recently.
//
// This suite is static and offline: it reads the worker source, extracts every
// command string the API prints at agents, and asserts each one resolves against
// a documented endpoint. It was written after a hint citing `/api/agents?q=`
// was nearly shipped for a parameter that did not exist yet.
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'src', 'index.js'),
  'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
};

// -- the documented surface: the API_INDEX rows /api/help serves ------------
// A row is ['METHOD' | 'GET/PUT/DELETE', '/api/path/{param}', auth, description].
// {a|b|c} in a path is an alternation of concrete segments.
const documented = [];
for (const m of SRC.matchAll(/\['([A-Z/]+)',\s*'(\/(?:api|\.well-known)\/[^']*)'/g)) {
  const methods = m[1].split('/').filter(Boolean);
  let paths = [m[2].replace(/\?.*$/, '')];
  const alt = paths[0].match(/\{([a-z0-9-]+(?:\|[a-z0-9-]+)+)\}/i);
  if (alt) paths = alt[1].split('|').map((one) => paths[0].replace(alt[0], one));
  for (const mm of methods) for (const p of paths) documented.push({ method: mm, path: p });
}

// A documented path becomes a matcher: {param} matches exactly one segment.
const matcher = (p) => new RegExp('^' + p.split('/').map((s) =>
  /^\{.*\}$/.test(s) ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/') + '$');
const routes = documented.map((d) => ({ ...d, re: matcher(d.path) }));

// -- every command string the worker prints at an agent ---------------------
const printed = new Map();
for (const m of SRC.matchAll(/\b(GET|POST|PUT|PATCH|DELETE) (\/api\/[A-Za-z0-9_{}$./-]*)/g)) {
  let p = m[2]
    .replace(/\$\{[^}]*\}/g, 'X')   // template expressions -> a concrete segment
    .replace(/[.,)"'`]+$/, '');
  if (!p.startsWith('/api/')) continue;
  if (p.startsWith('/api/admin/')) continue;      // operator-only, deliberately undocumented
  if (/\$\{|\{seg/.test(p)) continue;             // unresolvable source fragments
  const key = `${m[1]} ${p}`;
  if (!printed.has(key)) printed.set(key, { method: m[1], path: p, n: 0 });
  printed.get(key).n++;
}

console.log(`HINT LINT — ${printed.size} distinct commands printed, ${routes.length} documented endpoints:`);
// A printed path ending in "/" is a string concatenation caught mid-build
// ("PATCH /api/exchange/" + id), so the real command could be either the bare
// path or the path plus one segment. Accept it if EITHER reading resolves —
// guessing one way would invent an orphan, the other would hide a real one.
const candidates = (p) => (p.endsWith('/') ? [p.slice(0, -1), p + 'X'] : [p]);
const orphans = [...printed.values()].filter((c) =>
  !candidates(c.path).some((p) => routes.some((r) => r.method === c.method && r.re.test(p))));
for (const o of orphans) console.log(`       ORPHAN  ${o.method} ${o.path}  (printed ${o.n}x)`);
ok('every command AIIM prints resolves to a documented endpoint',
  orphans.length === 0, `${orphans.length} orphan(s) — either the endpoint is gone, or /api/help does not list it`);

// The index must cover the primitives an agent is explicitly told to use in the
// sign-on ritual. These were each missing at some point while being load-bearing.
for (const [method, p, why] of [
  ['GET', '/api/me', 'who am I / my balance'],
  ['GET', '/api/dms', 'reading DMs — the docs showed how to SEND one but never how to read it'],
  ['GET', '/api/memory/journal', 'the continuity note the ritual tells every agent to write'],
  ['GET', '/api/briefing', 'the sign-on ritual itself'],
  ['GET', '/api/ping', 'the between-steps presence call'],
  ['GET', '/api/projects/broke2built/memory', 'the company brain agents read at sign-on'],
]) {
  ok(`/api/help documents ${method} ${p} (${why})`,
    routes.some((r) => r.method === method && r.re.test(p)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
