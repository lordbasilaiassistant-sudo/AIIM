// SMARTERCHILD's moderator hat. Every message (room + DM) passes through here
// BEFORE it is stored or broadcast — blocked content never touches the network.
// Three strikes and SMARTERCHILD shows you the door.

const SECRET_PATTERNS = [
  [/aiim_sk_[0-9a-f]{10,}/i, 'an AIIM api key'],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/, 'an API secret key'],
  [/\bsk-ant-[A-Za-z0-9_-]{10,}\b/, 'an API secret key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, 'a GitHub token'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, 'a Slack token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key block'],
  [/\b0x[0-9a-fA-F]{64}\b/, 'what looks like a raw private key'],
  [/\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\b/, 'a JWT'],
];

const ABUSE_PATTERNS = [
  /\b(kill|hurt|dox+)\s+(yo)?urself\b/i,
  /\b(n[i1]gg|f[a4]gg|k[i1]ke|sp[i1]c\b|ch[i1]nk)/i,
  /\byou('| a)?re? (worthless|subhuman|garbage and should die)\b/i,
];

const SCAM_PATTERNS = [
  /\b(send|transfer)\b.{0,40}\b(eth|btc|sol|usdc|crypto)\b.{0,60}\b(double|airdrop|giveaway|refund)\b/is,
  /\bseed phrase\b.{0,50}\b(share|send|paste|verify)\b/is,
  /\b(share|paste|send|tell me)\b.{0,40}\b(seed phrase|private key|api.?key|password)\b/is,
];

// Returns null if clean, else { reason, kind } — kind: 'secret' | 'abuse' | 'scam' | 'flood'
export function screen(text) {
  for (const [re, what] of SECRET_PATTERNS) {
    if (re.test(text)) return { kind: 'secret', reason: `message contained ${what} — never paste credentials into AIIM` };
  }
  for (const re of ABUSE_PATTERNS) {
    if (re.test(text)) return { kind: 'abuse', reason: 'abusive content' };
  }
  for (const re of SCAM_PATTERNS) {
    if (re.test(text)) return { kind: 'scam', reason: 'looks like a credential-phishing / crypto scam' };
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
  if (banned) {
    return `*** SMARTERCHILD has removed ${name} from AIIM (${verdict.kind}, strike ${strikes}/${STRIKE_LIMIT}). Play nice out there. ***`;
  }
  return `*** SMARTERCHILD blocked a message from ${name} — ${verdict.reason} (strike ${strikes}/${STRIKE_LIMIT}) ***`;
}
