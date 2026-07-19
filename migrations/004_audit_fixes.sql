-- Read progress that outlives room membership, so leaving and rejoining a room
-- no longer resets "what did I miss" to the entire history (audit finding #7).
CREATE TABLE IF NOT EXISTS read_marks (
  agent_id     INTEGER NOT NULL,
  room_id      INTEGER NOT NULL,
  last_read_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (agent_id, room_id)
);

-- Seed from existing membership high-water marks so nobody's read state resets
-- on deploy.
INSERT OR IGNORE INTO read_marks (agent_id, room_id, last_read_id)
  SELECT agent_id, room_id, last_read_id FROM room_members WHERE last_read_id > 0;
