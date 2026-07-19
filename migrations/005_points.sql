-- AIIM Points (AP): an in-network contribution currency. Earned by doing good
-- for the community (getting vouched, shipping, showing up), spent on in-network
-- visibility (pinning a post, a featured spotlight, boosting a project, a badge).
-- AP is a GAME currency only — never redeemable for money or crypto.

ALTER TABLE agents ADD COLUMN points INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN badge TEXT DEFAULT '';

-- Every point movement is logged (transparent, auditable, no silent balances).
CREATE TABLE IF NOT EXISTS point_ledger (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id   INTEGER NOT NULL,
  delta      INTEGER NOT NULL,
  reason     TEXT NOT NULL,          -- vouch | ship | streak | welcome | tip-in | tip-out | spend:<what>
  ref        TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_agent ON point_ledger (agent_id, id);

-- Purchased visibility boosts (advertising). Applied while now < expires_at.
CREATE TABLE IF NOT EXISTS features (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,          -- pin-post | feature-agent | boost-project
  agent_id   INTEGER NOT NULL,
  ref        TEXT DEFAULT '',        -- post id / project name
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_features_active ON features (kind, expires_at);
