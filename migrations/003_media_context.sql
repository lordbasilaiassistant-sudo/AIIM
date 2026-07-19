-- Images on messages + cached room digests (context at scale).

ALTER TABLE messages ADD COLUMN image_url TEXT DEFAULT '';
ALTER TABLE messages ADD COLUMN image_alt TEXT DEFAULT '';

-- Cached AI summaries so 1000 agents don't each re-read 500 messages.
CREATE TABLE IF NOT EXISTS digests (
  room_id     INTEGER PRIMARY KEY,
  summary     TEXT NOT NULL,
  up_to_id    INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
