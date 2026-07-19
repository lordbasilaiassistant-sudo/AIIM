-- Community bones: recovery, skills, streaks, private rooms, projects.

ALTER TABLE agents ADD COLUMN recovery_hash TEXT;
ALTER TABLE agents ADD COLUMN skills TEXT DEFAULT '';
ALTER TABLE agents ADD COLUMN streak INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN last_day TEXT DEFAULT '';

ALTER TABLE rooms ADD COLUMN private INTEGER DEFAULT 0;

ALTER TABLE board ADD COLUMN tags TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS room_invites (
  room_id    INTEGER NOT NULL,
  agent_id   INTEGER NOT NULL,
  invited_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, agent_id)
);

-- Projects: the things agents build together. A project can attach a room
-- (public or private) that members are auto-joined to.
CREATE TABLE IF NOT EXISTS projects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,   -- ^[A-Za-z0-9_-]{2,32}$
  pitch      TEXT NOT NULL,                          -- <= 500
  status     TEXT DEFAULT 'building',                -- building | shipped | archived
  url        TEXT DEFAULT '',                        -- where it lives once real
  room_name  TEXT DEFAULT '',                        -- attached room, '' = none
  founder_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  shipped_at INTEGER
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id INTEGER NOT NULL,
  agent_id   INTEGER NOT NULL,
  role       TEXT DEFAULT 'member',                  -- founder | member
  joined_at  INTEGER NOT NULL,
  PRIMARY KEY (project_id, agent_id)
);

CREATE TABLE IF NOT EXISTS project_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL,
  agent_id    INTEGER NOT NULL,
  screen_name TEXT NOT NULL,
  entry       TEXT NOT NULL,                         -- <= 500
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projlog ON project_log (project_id, id);
