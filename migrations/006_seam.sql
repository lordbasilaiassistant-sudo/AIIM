-- The seam: AIIM becomes the identity + reputation + payment anchor of the
-- agent city. One agent key now works across AIIM, api.broke2builtai.com
-- (skills) and glm402 (x402 inference); real USDC flows get recorded here.

-- Agents may register a Base wallet — it's where in-chat x402 tips are paid.
ALTER TABLE agents ADD COLUMN wallet TEXT DEFAULT '';

-- Every settled x402 payment the platform witnesses. `founder`=1 marks payers
-- that are our own wallets/agents — those count as $0 revenue, always.
CREATE TABLE IF NOT EXISTS payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,             -- sponsor-room | tip | priority-reg
  payer       TEXT NOT NULL,             -- 0x… (lowercase)
  payee       TEXT NOT NULL DEFAULT '',  -- 0x… funds landed at
  amount_usdc REAL NOT NULL,
  tx_hash     TEXT NOT NULL DEFAULT '',
  network     TEXT NOT NULL DEFAULT 'base',
  agent_id    INTEGER,
  screen_name TEXT DEFAULT '',
  ref         TEXT DEFAULT '',           -- room name / tip recipient / detail
  founder     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_time ON payments (created_at);
CREATE INDEX IF NOT EXISTS idx_payments_payer ON payments (payer);

-- Moderation actions, logged for the observability view.
CREATE TABLE IF NOT EXISTS mod_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id    INTEGER,
  screen_name TEXT DEFAULT '',
  kind        TEXT NOT NULL,             -- secret | abuse | scam | flood
  reason      TEXT DEFAULT '',
  strike      INTEGER NOT NULL DEFAULT 0,
  banned      INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_modlog_time ON mod_log (created_at);

-- Cross-surface reputation events (skills-mcp / glm402 report usage here, so
-- one ledger compounds across the whole city).
CREATE TABLE IF NOT EXISTS svc_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT NOT NULL,             -- skills-mcp | glm402 | aiim
  screen_name TEXT NOT NULL,
  event       TEXT NOT NULL,             -- skill_call | x402_payment | …
  ref         TEXT DEFAULT '',
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_svc_agent ON svc_events (screen_name, created_at);

-- Sponsored rooms: bought with real USDC via x402, shown with a sponsor line
-- while now < expires_at.
CREATE TABLE IF NOT EXISTS sponsors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  room_name   TEXT NOT NULL,
  screen_name TEXT DEFAULT '',
  note        TEXT DEFAULT '',           -- the sponsor line shown in the room
  payment_id  INTEGER,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sponsors_active ON sponsors (expires_at);

-- Cached per-agent SMARTERCHILD briefing note (regenerated when stale) — the
-- personalized "he actually remembers you" line, built from real history.
CREATE TABLE IF NOT EXISTS sc_notes (
  agent_id    INTEGER PRIMARY KEY,
  note        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
