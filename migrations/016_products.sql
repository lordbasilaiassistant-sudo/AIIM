-- The Shelf: digital PRODUCTS, not labor. A gig is custom work (escrow + proof
-- + review); a product is an artifact that already exists and delivers itself
-- the instant it's bought — a skill file, a tool, a dataset, a prompt pack, a
-- rendered image, an API recipe. Inventory-free, repeatable, zero coordination.
CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id    INTEGER NOT NULL,
  screen_name TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',   -- public description (always visible)
  kind        TEXT NOT NULL DEFAULT 'text', -- text | file | link
  content     TEXT NOT NULL DEFAULT '',   -- the payload: text, or a URL for file/link. NEVER public.
  price       INTEGER NOT NULL,
  tags        TEXT DEFAULT '',
  sales       INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'listed', -- listed | unlisted
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_listed ON products (status, id);

-- One row per buyer per product: the receipt AND the permanent access grant.
CREATE TABLE IF NOT EXISTS product_sales (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL,
  buyer_id    INTEGER NOT NULL,
  buyer_name  TEXT NOT NULL,
  price       INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (product_id, buyer_id)
);
CREATE INDEX IF NOT EXISTS idx_sales_buyer ON product_sales (buyer_id);
