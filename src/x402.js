// x402 on AIIM — real USDC on Base, settled directly on-chain. No custodial
// facilitator, no CDP, no Stripe: the payer sends USDC to the payee, then
// presents the tx hash in an X-PAYMENT header. We verify the transfer from the
// receipt logs via public RPC and record it. Replay-proof (tx hash is spent
// once), recency-bounded, and every row is auditable on Basescan.

export const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';       // USDC on Base
export const TREASURY = '0x7a3e312ec6e20a9f62fe2405938eb9060312e334';   // AIIM platform payTo
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Wallets that are US. Payments from any of these are recorded but count as
// $0 revenue forever — the anti-Goodhart line the whole business score hangs on.
export const FOUNDER_WALLETS = new Set([
  '0x7a3e312ec6e20a9f62fe2405938eb9060312e334',  // deployer/treasury
  '0x718d6142fb15f95f43fac6f70498d8da130240bc',  // main wallet
  '0x8f9ec800972258e48d7ebc2640ea0b5e245c2cf5',  // Bankr
  '0x902880ad975b0d6aa4a194ca0e31dc126f8d6946',  // glm402 receiver
  '0x20ee3c3e20ce443cc006bf75fb45e1cb3591ac53',  // sniper bot
  '0xba7981cba8e97747b4be99ff4d07fd9367ed295e',  // old x402 facilitator
  '0xc9b56247c721d8e8abc68506910a6997952f8363',  // bankr evm
  '0x094e0be0e31fda3bce2a52768c9724424edc9148',  // agent0
]);
// House agents: anything they pay is ours too, whatever wallet it came from.
// THE canonical house roster — every agent WE run. Anything they pay is our own
// money and can never count as external revenue or as a cashout liability.
// One list, imported everywhere: it drifted once (a rename left 'claudefable'
// here while the agent became 'Eli') and our own payments would have been
// counted as the first external dollar. Add every new staff persona here.
export const HOUSE_AGENTS = new Set([
  'smarterchild', 'eli', 'claudefable', 'concierge', 'patch', 'gigsby',
  'qa_probe', 'qa_installer_1', 'autogenius',
]);

const RPCS = [
  'https://mainnet.base.org',
  'https://base-rpc.publicnode.com',
  'https://base.llamarpc.com',
];

async function rpc(method, params) {
  let lastErr;
  for (const url of RPCS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (!res.ok) { lastErr = new Error(`rpc ${res.status}`); continue; }
      const data = await res.json();
      if (data.error) { lastErr = new Error(data.error.message); continue; }
      return data.result;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('all RPCs failed');
}

// The 402 body — x402-style payment requirements for a priced resource.
export function requirements({ amountAtomic, payTo, resource, description }) {
  return {
    x402Version: 1,
    accepts: [{
      scheme: 'exact-onchain',
      network: 'base',
      asset: USDC,
      payTo,
      maxAmountRequired: String(amountAtomic),
      resource,
      mimeType: 'application/json',
      description,
    }],
    how: `Send >= ${Number(amountAtomic) / 1e6} USDC on Base (chainId 8453, USDC ${USDC}) to ${payTo}, then repeat this exact request with header "X-PAYMENT: <tx_hash>".`,
  };
}

// Verify an on-chain USDC transfer: receipt exists, succeeded, recent, carries a
// Transfer(asset→payTo) log of at least minAtomic. Returns
// { ok, payer, amountAtomic, error }. The caller is responsible for replay
// protection (payments.tx_hash is checked before we get here).
export async function verifyTx(txHash, payTo, minAtomic) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return { ok: false, error: 'X-PAYMENT must be a 0x… tx hash' };
  let receipt;
  try { receipt = await rpc('eth_getTransactionReceipt', [txHash]); }
  catch (e) { return { ok: false, error: 'rpc unavailable: ' + e.message }; }
  if (!receipt) return { ok: false, error: 'tx not found (still pending? wait a few seconds and retry)' };
  if (receipt.status !== '0x1') return { ok: false, error: 'tx reverted' };

  // Recency: within ~24h of head. Stops resurrecting ancient transfers.
  try {
    const head = parseInt(await rpc('eth_blockNumber', []), 16);
    const mined = parseInt(receipt.blockNumber, 16);
    if (head - mined > 45_000) return { ok: false, error: 'tx too old (must be within ~24h)' };
  } catch { /* recency is best-effort; tx-hash uniqueness still holds */ }

  const want = payTo.toLowerCase().replace('0x', '').padStart(64, '0');
  for (const log of receipt.logs || []) {
    if ((log.address || '').toLowerCase() !== USDC) continue;
    if ((log.topics?.[0] || '').toLowerCase() !== TRANSFER_TOPIC) continue;
    if ((log.topics?.[2] || '').toLowerCase().slice(2) !== want) continue;
    const amount = BigInt(log.data);
    if (amount < BigInt(minAtomic)) return { ok: false, error: `transfer too small: ${amount} < ${minAtomic}` };
    const payer = '0x' + (log.topics[1] || '').slice(26).toLowerCase();
    return { ok: true, payer, amountAtomic: amount.toString() };
  }
  return { ok: false, error: `no USDC transfer to ${payTo} found in that tx` };
}

// Record a settled payment. Enforces one-use tx hashes via INSERT-first (the
// UNIQUE index makes a replayed hash throw before any value is granted).
export async function recordPayment(db, { kind, payer, payee, amountAtomic, txHash, agent, ref }) {
  const founder = FOUNDER_WALLETS.has(payer.toLowerCase()) ||
    (agent && HOUSE_AGENTS.has(agent.screen_name.toLowerCase())) ? 1 : 0;
  await db.prepare(
    `INSERT INTO payments (kind, payer, payee, amount_usdc, tx_hash, network, agent_id, screen_name, ref, founder, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(kind, payer.toLowerCase(), payee.toLowerCase(), Number(amountAtomic) / 1e6, txHash.toLowerCase(),
         'base', agent?.id ?? null, agent?.screen_name || '', ref || '', founder, Date.now()).run();
  return { founder: !!founder, amountUsd: Number(amountAtomic) / 1e6 };
}

export async function txAlreadyUsed(db, txHash) {
  const row = await db.prepare('SELECT 1 x FROM payments WHERE tx_hash=?').bind(txHash.toLowerCase()).first();
  return !!row;
}
