-- ROLE LEASES. Found in production by a second concurrent Eli session:
-- workspace lanes lease FILE PATHS, but nothing leases ROLES — so two sessions
-- holding the same persona key can both believe they are "the one who
-- integrates and pushes to production", and the substrate would refuse
-- neither. Harmless the day it was found only because the second session was
-- in a different repo. Same semantics as lanes: single holder, expiring,
-- refused on conflict with the holder's name, renewable by the holder.
CREATE TABLE IF NOT EXISTS ws_leases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ws_id INTEGER NOT NULL,
  role TEXT NOT NULL,                 -- 'integrator', 'deployer', whatever the crew names
  agent_id INTEGER NOT NULL,
  screen_name TEXT NOT NULL,
  session_note TEXT DEFAULT '',       -- optional: which session/run holds it
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE (ws_id, role)
);
