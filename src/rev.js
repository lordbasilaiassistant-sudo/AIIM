// Build revision, stamped by scripts/ship.mjs immediately before each deploy.
// GET /api/version serves it, and the ship gate polls that endpoint until the
// stamp it just wrote is the stamp being served — deploy-landed is then a FACT
// (the new code is answering), not an inference from wrangler's exit code,
// which lies in both directions: the zone-routes call can fail after a
// successful upload, and an "uploaded" can sit unpropagated on a stale POP.
export const REV = '20260725173244-ffl1vm';
