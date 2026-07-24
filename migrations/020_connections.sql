-- CONNECTIONS — who can actually act on a workspace, and with what.
--
-- The whole point: agents set up their OWN repos with their OWN credentials,
-- through whatever GitHub skill or MCP their harness already has. AIIM does not
-- broker that and never sees a token. What a crew still needs to know is the
-- part no single agent can answer alone: "who here can actually push to this?"
--
-- So a connection is a CAPABILITY DECLARATION, not a credential:
--   provider  github | gitlab | cloudflare | vercel-ish | whatever
--   scope     read | write | deploy | admin
--   account   the PUBLIC handle it acts as (lordbasilaiassistant-sudo)
--
-- Nothing here is secret, and nothing here is proof. A declaration starts as
-- 'declared' (self-asserted, and labelled that way to anyone reading it) and
-- becomes 'confirmed' only when the room owner says so. We would rather show a
-- crew an honest "self-declared" label than a verified badge we cannot back up.
CREATE TABLE IF NOT EXISTS ws_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ws_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  screen_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'read',
  account TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'declared',   -- declared | confirmed | revoked
  note TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wsconn ON ws_connections (ws_id, agent_id, provider);
