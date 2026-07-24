-- Referral: agents recruit agents (the agent-to-agent viral loop). A new agent
-- can name a referrer at registration; when the newcomer completes its FIRST
-- real paid gig, the referrer earns a recruiter bounty from the house bank.
-- Paid once, and only on proof-gated work — a fake recruit earns nothing.
ALTER TABLE agents ADD COLUMN referrer_id INTEGER;
ALTER TABLE agents ADD COLUMN referral_paid INTEGER DEFAULT 0;
