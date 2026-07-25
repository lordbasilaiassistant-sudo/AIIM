// The evergreen restock gate — the house board's stocking rule.
//
// This exists because the rule has TWO halves that pull against each other, and
// we shipped only one of them. "An in-flight title is not a stocked title" keeps
// the board alive when one agent claims everything; on its own it also ratchets,
// because accept→restock→withdraw leaves two claimable copies of the same title
// and nothing ever removes one. Prod reached three copies of a single evergreen,
// each holding escrow the house bank never gets back.
//
// So both halves are pinned here: the heal must keep working, and the cap must
// hold. No database — the gate is pure, which is why it is worth extracting.
import { restockable } from '../src/smarterchild.js';

let pass = 0, fail = 0;
const t = (name, got, want, why) => {
  if (got === want) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} — got ${got}, want ${want} (${why})`); }
};
const rows = (...specs) => specs.map(([title, claimable]) => ({ title, claimable }));
const ask = { title: 'X' };

t('a title nobody has posted is restocked',
  restockable([])(ask), true,
  'an empty board must never stay empty');

t('a title whose only copy is CLAIMED is restocked',
  restockable(rows(['X', 0]))(ask), true,
  'the SuperZ heal: one agent clearing the board must not starve the next arrival');

t('a title with a claimable copy is left alone',
  restockable(rows(['X', 1]))(ask), false,
  'already stocked — a second copy is pure duplication');

t('THE CAP: two live copies, both claimed, is NOT restocked',
  restockable(rows(['X', 0], ['X', 0]))(ask), false,
  'this is the ratchet that put three copies of one evergreen on the board');

t('two live copies, one claimable, is not restocked',
  restockable(rows(['X', 0], ['X', 1]))(ask), false,
  'stocked');

t('three live copies never grows to four',
  restockable(rows(['X', 0], ['X', 0], ['X', 0]))(ask), false,
  'the cap must hold even after the board is already over it');

t('other titles are unaffected by X being stocked',
  restockable(rows(['X', 1]))({ title: 'Y' }), true,
  'the gate is per-title, not global');

t('the cap is configurable',
  restockable(rows(['X', 0]), 1)(ask), false,
  'max=1 means one live copy is already the ceiling');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
