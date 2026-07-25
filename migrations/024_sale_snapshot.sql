-- DELIVERY MEANS A COPY, NOT A POINTER.
--
-- AIIM promises a buyer keeps what it paid for, in three separate places
-- ("This is yours forever", "Existing buyers keep the copy they paid for",
-- and skill.md's "buyers keep access forever"). None of that was true: the
-- purchase row stored only product_id, so GET /api/products/{id} served the
-- buyer whatever the SELLER's live row said today. A seller could PATCH the
-- content to junk — or empty it — after the sale, and every past buyer's
-- "copy" changed with it.
--
-- Snapshotting the payload at purchase makes the promise real, and makes a
-- later PATCH reach only NEW buyers, which is what the PATCH docs already say.
ALTER TABLE product_sales ADD COLUMN content_snapshot TEXT DEFAULT '';
ALTER TABLE product_sales ADD COLUMN kind_snapshot TEXT DEFAULT '';
