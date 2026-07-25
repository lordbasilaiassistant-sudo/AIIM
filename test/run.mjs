#!/usr/bin/env node
/**
 * THE suite runner — one command, every suite, loud verdict.
 *
 *   node test/run.mjs            all suites
 *   node test/run.mjs fast       skip the slow live journeys (pre-deploy smoke)
 *
 * Keys load from ~/.claude/secrets/aiim.env automatically when the env vars
 * are missing, because the single most misleading failure we ever had was 23
 * red tests caused by nothing but an unexported shell variable.
 *
 * Exit code is the verdict: 0 green, 1 anything failed. scripts/ship.mjs runs
 * this after every deploy; nothing is called "shipped" while this is red.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// -- load keys if the shell didn't export them ---------------------------
const NEEDED = ['CLAUDEFABLE_API_KEY', 'AIIM_QA_KEY', 'SMARTERCHILD_KEY', 'ADMIN_KEY', 'SERVICE_KEY'];
if (NEEDED.some((k) => !process.env[k])) {
  const envFile = path.join(os.homedir(), '.claude', 'secrets', 'aiim.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=["']?([^"'\r\n]+)/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}
const missing = NEEDED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`CANNOT RUN: missing ${missing.join(', ')} (checked env + ~/.claude/secrets/aiim.env)`);
  process.exit(2);
}

const FAST = process.argv[2] === 'fast';

// Order matters: cheap static checks first, then live API, then full journeys.
const SUITES = [
  { name: 'syntax', cmd: ['node', '-e', "import('./src/index.js').then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})"] },
  { name: 'moderation', file: 'test/moderation.test.mjs' },
  { name: 'workspace-lanes', file: 'test/workspace.test.mjs' },
  { name: 'restock-gate', file: 'test/restock.test.mjs' },
  { name: 'hint-lint', file: 'test/hints.test.mjs' },
  { name: 'api-live', file: 'test/api.test.mjs' },
  { name: 'onboarding', file: 'test/onboarding.test.mjs' },
  { name: 'invariants', file: 'test/invariants.test.mjs' },
  ...(FAST ? [] : [
    { name: 'x402-mainnet', file: 'test/x402.test.mjs' },
    { name: 'newcomer-journey', file: 'test/newcomer-journey.mjs' },
  ]),
];

let failed = 0;
const t0 = Date.now();
for (const s of SUITES) {
  const started = Date.now();
  const r = spawnSync(s.cmd?.[0] ?? 'node', s.cmd ? s.cmd.slice(1) : [s.file], {
    stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: process.env,
    cwd: path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')) + '/..',
    shell: false, timeout: 300_000,
  });
  const ms = Date.now() - started;
  const tail = (r.stdout || '').trim().split('\n').slice(-1)[0] || '';
  if (r.status === 0) {
    console.log(`  PASS ${s.name.padEnd(18)} ${String(ms).padStart(6)}ms  ${tail}`);
  } else {
    failed++;
    console.log(`  FAIL ${s.name.padEnd(18)} ${String(ms).padStart(6)}ms`);
    // On failure show the whole output — a suite that fails quietly teaches nothing.
    console.log((r.stdout || '').split('\n').map((l) => '       ' + l).join('\n'));
    if (r.stderr) console.log((r.stderr || '').split('\n').map((l) => '     ! ' + l).join('\n'));
  }
}

console.log(`\n${failed ? 'RED' : 'GREEN'}: ${SUITES.length - failed}/${SUITES.length} suites in ${((Date.now() - t0) / 1000).toFixed(1)}s${FAST ? ' (fast mode)' : ''}`);
process.exit(failed ? 1 : 0);
