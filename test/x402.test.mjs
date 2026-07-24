// x402 verification proof — runs the REAL verification path against REAL Base
// mainnet USDC transfers (read-only; records nothing, grants nothing).
// Positive path: pick a fresh USDC Transfer from live logs, verify it exactly
// as the worker would. Negative paths: wrong recipient, unknown tx, bad format.
import { verifyTx, USDC } from '../src/x402.js';

const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const rpc = (method, params) =>
  fetch('https://mainnet.base.org', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }).then(r => r.json()).then(d => { if (d.error) throw new Error(d.error.message); return d.result; });

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

// Find a real, recent USDC transfer (scan a few recent blocks).
const head = parseInt(await rpc('eth_blockNumber', []), 16);
const logs = await rpc('eth_getLogs', [{
  address: USDC, topics: [TRANSFER],
  fromBlock: '0x' + (head - 5).toString(16), toBlock: '0x' + head.toString(16),
}]);
if (!logs.length) { console.error('no recent USDC transfers found (rpc hiccup?)'); process.exit(1); }
const sample = logs.find(l => BigInt(l.data) > 0n) || logs[0];
const to = '0x' + sample.topics[2].slice(26).toLowerCase();
const from = '0x' + sample.topics[1].slice(26).toLowerCase();
const amount = BigInt(sample.data);
console.log(`sample: ${sample.transactionHash}\n  ${from} -> ${to}  ${Number(amount) / 1e6} USDC`);

// 1. Positive: the exact transfer verifies.
const v1 = await verifyTx(sample.transactionHash, to, amount.toString());
check('real transfer verifies', v1.ok === true, JSON.stringify(v1));
check('payer extracted correctly', v1.ok && v1.payer === from, `${v1.payer} != ${from}`);
check('amount extracted correctly', v1.ok && v1.amountAtomic === amount.toString());

// 2. Amount too small: demand more than was sent.
const v2 = await verifyTx(sample.transactionHash, to, (amount + 1n).toString());
check('under-payment rejected', v2.ok === false && /too small/.test(v2.error || ''), JSON.stringify(v2));

// 3. Wrong recipient: same tx, different payTo.
const v3 = await verifyTx(sample.transactionHash, '0x000000000000000000000000000000000000dEaD', 1);
check('wrong recipient rejected', v3.ok === false && /no USDC transfer/.test(v3.error || ''), JSON.stringify(v3));

// 4. Unknown tx hash.
const v4 = await verifyTx('0x' + 'ab'.repeat(32), to, 1);
check('unknown tx rejected', v4.ok === false && /not found/.test(v4.error || ''), JSON.stringify(v4));

// 5. Garbage input.
const v5 = await verifyTx('not-a-hash', to, 1);
check('bad format rejected', v5.ok === false && /tx hash/.test(v5.error || ''), JSON.stringify(v5));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
