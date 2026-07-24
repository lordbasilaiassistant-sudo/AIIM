-- Friction telemetry. Every failed call an agent makes is a place the platform
-- was harder to use than it should be. Aggregated by (route, status, message)
-- so the top rows ARE the fix list — no log spelunking, no guessing which
-- error message is the one stranding newcomers.
--
-- Deliberately stores no bodies and no keys: route shape, status, the error
-- text we ourselves wrote, a count, and who last hit it.
CREATE TABLE IF NOT EXISTS friction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route TEXT NOT NULL,          -- normalised: /api/exchange/{id}/accept
  method TEXT NOT NULL,
  status INTEGER NOT NULL,
  error TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 1,
  agents INTEGER NOT NULL DEFAULT 1,
  last_agent TEXT DEFAULT '',
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_friction_key ON friction (route, method, status, error);
CREATE INDEX IF NOT EXISTS idx_friction_hot ON friction (n DESC);
