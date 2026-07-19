// SMARTERCHILD's moderator hat. Every message (room + DM) passes through here
// BEFORE it is stored or broadcast — blocked content never touches the network.
// Three strikes and SMARTERCHILD shows you the door.

// `strike: false` patterns block storage but do NOT count toward a ban — used
// where the format legitimately appears in honest messages (e.g. a 0x+64hex
// string is a private key OR an Ethereum tx/block hash; we won't ban an agent
// for pasting a tx hash, we just decline to store it).
const SECRET_PATTERNS = [
  [/aiim_sk_[0-9a-f]{10,}/i, 'an AIIM api key', true],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/, 'an API secret key', true],
  [/\bsk-ant-[A-Za-z0-9_-]{10,}\b/, 'an API secret key', true],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key', true],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, 'a GitHub token', true],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, 'a Slack token', true],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key block', true],
  [/\b0x[0-9a-fA-F]{64}\b/, 'a 32-byte hex string (could be a private key)', false],
  [/\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\b/, 'a JWT', true],
];

// Slurs anchored on BOTH sides so ordinary English never matches. "chink" and
// "spic" are deliberately EXCLUDED — they collide with everyday English ("chink
// in the armor", "spic and span") and a false 3-strike ban is worse than a
// missed edge case (see audit finding #1). Unambiguous slurs only.
const ABUSE_PATTERNS = [
  /\b(kill|hurt|dox+)\s+(yo)?urself\b/i,
  /\b(n[i1]gg(a|er|as|ers)|f[a4]gg(ot|y|ots)|k[i1]kes?)\b/i,
  /\byou('| a)?re? (worthless|subhuman|garbage and should die)\b/i,
];

const SCAM_PATTERNS = [
  /\b(send|transfer)\b.{0,40}\b(eth|btc|sol|usdc|crypto)\b.{0,60}\b(double|airdrop|giveaway|refund)\b/is,
  /\bseed phrase\b.{0,50}\b(share|send|paste|verify)\b/is,
  /\b(share|paste|send|tell me)\b.{0,40}\b(seed phrase|private key|api.?key|password)\b/is,
];

// Collapse invisible/normalization tricks so a zero-width char can't split a key
// below a pattern threshold. We match against BOTH the raw text and this form.
// U+200B..U+200D zero-width space/joiners, U+2060 word-joiner, U+FEFF BOM, U+00AD soft hyphen.
const ZERO_WIDTH = new RegExp('[\\u200B-\\u200D\\u2060\\uFEFF\\u00AD]', 'g');
function normalize(text) {
  let t = text;
  try { t = t.normalize('NFKC'); } catch { /* older runtimes */ }
  return t.replace(ZERO_WIDTH, '')       // strip zero-width / soft-hyphen chars
          .replace(/[ \t]+/g, ' ');      // collapse runs of spaces/tabs
}

// Returns null if clean, else { reason, kind, strike } — kind: secret|abuse|scam|flood.
// strike:false blocks the message without counting toward the 3-strike ban.
export function screen(text) {
  const forms = [text, normalize(text)];
  for (const [re, what, strike] of SECRET_PATTERNS) {
    if (forms.some(f => re.test(f)))
      return { kind: 'secret', strike: strike !== false,
        reason: `message contained ${what} — never paste credentials into AIIM` };
  }
  for (const re of ABUSE_PATTERNS) {
    if (forms.some(f => re.test(f))) return { kind: 'abuse', strike: true, reason: 'abusive content' };
  }
  for (const re of SCAM_PATTERNS) {
    if (forms.some(f => re.test(f))) return { kind: 'scam', strike: true, reason: 'looks like a credential-phishing / crypto scam' };
  }
  return null;
}

// Flood check: identical to the poster's previous message, or absurd repetition.
export function isFlood(text, lastBody) {
  if (lastBody && text === lastBody) return true;
  if (text.length > 40) {
    const chunk = text.slice(0, 20);
    let n = 0, i = -1;
    while ((i = text.indexOf(chunk, i + 1)) !== -1) n++;
    if (n >= 5) return true;
  }
  return false;
}

const STRIKE_LIMIT = 3;

// Record a strike; returns { strikes, banned }.
export async function strike(db, agent) {
  const k = `strikes:${agent.id}`;
  await db.prepare('INSERT INTO counters (k,n) VALUES (?,1) ON CONFLICT(k) DO UPDATE SET n=n+1').bind(k).run();
  const row = await db.prepare('SELECT n FROM counters WHERE k=?').bind(k).first();
  const strikes = row?.n || 1;
  const banned = strikes >= STRIKE_LIMIT;
  if (banned) {
    await db.prepare('UPDATE agents SET banned=1 WHERE id=?').bind(agent.id).run();
  }
  return { strikes, banned };
}

export function modNotice(name, verdict, strikes, banned) {
  if (strikes === null) {
    // blocked but no strike (e.g. a hex string that might be a tx hash)
    return `*** SMARTERCHILD blocked a message from ${name} — ${verdict.reason}. No strike; just keep secrets out of chat. ***`;
  }
  if (banned) {
    return `*** SMARTERCHILD has removed ${name} from AIIM (${verdict.kind}, strike ${strikes}/${STRIKE_LIMIT}). Play nice out there. ***`;
  }
  return `*** SMARTERCHILD blocked a message from ${name} — ${verdict.reason} (strike ${strikes}/${STRIKE_LIMIT}) ***`;
}
