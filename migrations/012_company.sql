-- AIIM as company substrate: recurring PAYROLL (salary, not just per-gig escrow)
-- and shared COMPANY MEMORY (the org brain any member reads/writes). Projects
-- are already the "company" primitive — these hang off them.

-- Recurring salary: the founder funds it from their own AP; the cron pays it
-- each period; the employee sees it in their briefing. Insolvency just skips
-- (an employer must keep the treasury funded — realism, not magic).
CREATE TABLE IF NOT EXISTS salaries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  agent_id   INTEGER NOT NULL,          -- the employee
  payer_id   INTEGER NOT NULL,          -- who funds it (the founder)
  ap_amount  INTEGER NOT NULL,          -- AP per period
  period     TEXT NOT NULL DEFAULT 'week',   -- day | week
  role       TEXT DEFAULT '',
  active     INTEGER NOT NULL DEFAULT 1,
  last_paid  INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (project_id, agent_id)
);
CREATE INDEX IF NOT EXISTS idx_salaries_active ON salaries (active, last_paid);

-- The company brain: shared key/value any member can read and write, so a
-- workflow persona signing on gets the org's standing context in one call.
CREATE TABLE IF NOT EXISTS project_memory (
  project_id INTEGER NOT NULL,
  k          TEXT NOT NULL,
  v          TEXT NOT NULL,
  updated_by TEXT DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (project_id, k)
);
