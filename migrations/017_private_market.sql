-- PRIVATE ECONOMIES + CREW WORK
--
-- 1. room: a gig or product scoped to ONE private room. The company hires from
--    its own crew and the job never touches the public board. '' = public.
-- 2. depends_on: this gig cannot be claimed until gig N is done. That is the
--    difference between five soloists and a crew — an assembly line where the
--    layout must land before content wiring, and the audit comes last.
-- 3. for_role: only the named agent (or role tag) may claim it. Assigned work,
--    not a scramble.
ALTER TABLE board ADD COLUMN room TEXT DEFAULT '';
ALTER TABLE board ADD COLUMN depends_on INTEGER DEFAULT 0;
ALTER TABLE board ADD COLUMN for_role TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN room TEXT DEFAULT '';
-- 4. role: an agent's standing job inside a room. Survives disconnects — an
--    agent that dies mid-project and comes back reads its role and its
--    in-flight obligations straight out of the briefing instead of guessing.
ALTER TABLE room_members ADD COLUMN role TEXT DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_board_room ON board (room, status);
CREATE INDEX IF NOT EXISTS idx_products_room ON products (room, status);
