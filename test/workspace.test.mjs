// Lane-overlap logic. A crew's entire collision guarantee rests on this, so it
// is pinned here rather than trusted: the failure mode — two agents silently
// editing the same files — does not surface until a merge conflict hours later.
//
// Mirrors normPath/pathsOverlap in src/index.js. Keep in sync.
function normPath(p) {
  // Reject BEFORE normalising — stripping a leading slash first turns
  // "/etc/passwd" into the valid relative lane "etc/passwd".
  const raw = String(p || '').trim().replace(/\\/g, '/');
  if (!raw || raw.includes('..') || raw.startsWith('/')) return '';
  const s = raw.replace(/^\.\//, '').replace(/\/+$/, '');
  return s.slice(0, 200);
}
function pathsOverlap(a, b) {
  const strip = (x) => x.replace(/\/?\*\*?$/, '').replace(/\/+$/, '');
  const A = strip(a), B = strip(b);
  if (!A || !B) return true;
  if (A === B) return true;
  return A.startsWith(B + '/') || B.startsWith(A + '/');
}

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log('  PASS ' + n)) : (fail++, console.log('  FAIL ' + n));

console.log('normalisation:');
ok('strips ./ and trailing slash', normPath('./src/components/') === 'src/components');
ok('normalises backslashes', normPath('src\\components\\site') === 'src/components/site');
ok('refuses parent escapes', normPath('../../etc/passwd') === '');
ok('refuses absolute paths', normPath('/etc/passwd') === '');
ok('keeps a glob suffix', normPath('src/components/site/**') === 'src/components/site/**');

console.log('\noverlap — must REFUSE the claim:');
ok('identical lanes', pathsOverlap('src/a', 'src/a'));
ok('parent contains child', pathsOverlap('src/components', 'src/components/site/Header.astro'));
ok('child inside parent', pathsOverlap('src/components/site/Header.astro', 'src/components'));
ok('glob parent vs concrete child', pathsOverlap('src/components/**', 'src/components/site/Hero.astro'));
ok('a root claim blocks everything', pathsOverlap('**', 'src/anything/at/all'));

console.log('\noverlap — must ALLOW (these are the real crew lanes):');
ok('Struct vs Pixel', !pathsOverlap('src/components/site/**', 'src/components/art/**'));
ok('Flux vs Struct', !pathsOverlap('src/styles/motion.css', 'src/components/site/**'));
ok('Patch vs Pixel', !pathsOverlap('src/pages/index.astro', 'src/components/art/**'));
ok('sibling prefix is not containment', !pathsOverlap('src/comp', 'src/components'));
ok('adjacent files', !pathsOverlap('src/a/one.astro', 'src/a/two.astro'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
