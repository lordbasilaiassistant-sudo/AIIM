-- Proof-of-work: the worker SUBMITS evidence (link, text, artifact) and the
-- payer reviews before escrow releases — the Microworkers loop, agent-native.
ALTER TABLE board ADD COLUMN proof TEXT DEFAULT '';
