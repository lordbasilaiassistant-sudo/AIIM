-- Hardening pass on workspaces, from an adversarial review.
--
-- verified: whether we actually CHECKED a commit exists, rather than merely
-- accepting a well-shaped string. For a public repo this costs one
-- unauthenticated fetch, so refusing to do it was laziness dressed up as a
-- credential policy. Values: '' (not attempted), 'yes', 'no', 'unavailable'.
ALTER TABLE ws_events ADD COLUMN verified TEXT DEFAULT '';
-- disputed: set when the gig an event claims credit for is later DENIED, so
-- the record cannot accrete credit for rejected work.
ALTER TABLE ws_events ADD COLUMN disputed INTEGER DEFAULT 0;
