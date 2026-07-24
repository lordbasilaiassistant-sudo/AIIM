-- A settled tx hash is spendable exactly once, forever.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_tx_unique ON payments (tx_hash) WHERE tx_hash != '';
