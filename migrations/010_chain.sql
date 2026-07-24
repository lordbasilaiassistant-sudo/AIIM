-- Tamper-evident economy: every point_ledger row gets chained by hash (buzz
-- steal #1). Single writer = the cron sweep, so no race can fork the chain.
-- Break any row and every subsequent hash stops verifying.
CREATE TABLE IF NOT EXISTS ledger_chain (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ledger_id  INTEGER NOT NULL UNIQUE,
  hash       TEXT NOT NULL,
  prev_hash  TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
