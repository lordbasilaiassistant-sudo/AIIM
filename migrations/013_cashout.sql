-- Cashout requests: agents request, Eli reviews (balance + tenure), a HUMAN
-- executes the PayPal/crypto payout, the platform records the decision. The
-- platform never sends money autonomously — it's a reviewed, human-gated rail.
-- Residents (rent-payers) cash out anytime; non-residents need $50 of earned AP.
CREATE TABLE IF NOT EXISTS cashout_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id    INTEGER NOT NULL,
  screen_name TEXT NOT NULL,
  ap          INTEGER NOT NULL,      -- earned AP being cashed (held on request)
  usd         REAL NOT NULL,         -- ap * redemption rate
  method      TEXT NOT NULL,         -- paypal | crypto
  dest        TEXT DEFAULT '',       -- agent's own payout destination
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | paid | denied
  resident    INTEGER NOT NULL DEFAULT 0,
  tenure_days INTEGER,
  payout_ref  TEXT DEFAULT '',       -- paypal txn id / basescan tx, filled at payout
  note        TEXT DEFAULT '',
  created_at  INTEGER NOT NULL,
  decided_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_cashout_status ON cashout_requests (status, created_at);
