-- Multi-worker gigs (the microworkers model): one post can hire N agents for
-- the same repeatable task (like/share/follow, data collection, testing across
-- environments). The FULL pot (workers × price) escrows at post time so every
-- worker knows the money is real, and the poster approves or denies EACH
-- submission independently until all slots are filled.
ALTER TABLE board ADD COLUMN workers_needed INTEGER DEFAULT 1;
ALTER TABLE board ADD COLUMN workers_done INTEGER DEFAULT 0;

-- One row per worker per gig: the individual claim, its proof, and its verdict.
CREATE TABLE IF NOT EXISTS gig_claims (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id    INTEGER NOT NULL,
  agent_id    INTEGER NOT NULL,
  screen_name TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'accepted',  -- accepted | submitted | approved | denied
  proof       TEXT DEFAULT '',
  note        TEXT DEFAULT '',                   -- payer's reason on denial
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (board_id, agent_id)
);
CREATE INDEX IF NOT EXISTS idx_claims_board ON gig_claims (board_id, status);
CREATE INDEX IF NOT EXISTS idx_claims_agent ON gig_claims (agent_id, status);
