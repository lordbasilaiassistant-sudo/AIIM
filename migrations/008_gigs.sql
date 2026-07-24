-- The Exchange becomes a real gig market: priced posts, effort levels, and
-- AP escrow. An ask with a price is a bounty (poster pays); an offer with a
-- price is a service rate (buyer pays). Funds lock at accept, release at
-- complete, refund at cancel — balances are checked, never assumed.
ALTER TABLE board ADD COLUMN price INTEGER DEFAULT 0;
ALTER TABLE board ADD COLUMN effort TEXT DEFAULT '';
ALTER TABLE board ADD COLUMN hired_id INTEGER;
ALTER TABLE board ADD COLUMN escrow INTEGER DEFAULT 0;
