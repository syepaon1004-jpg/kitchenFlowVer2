// Selftest for watcher.js. Run directly: `node .harness/auto/selftest.js`.
// Imports watcher module without booting chokidar (main() is guarded by a
// direct-invocation check in watcher.js). Each test prints PASS/FAIL and the
// script exits with non-zero status on any failure.

import fs from 'node:fs';
import path from 'node:path';
import {
  callClaude,
  callCodex,
  runPhase1,
  writePhaseOutput,
  PATHS,
} from './watcher.js';

const TASK_ID = 'SELFTEST';
let pass = 0;
let fail = 0;
const failDetails = [];

function record(name, ok, detail = '') {
  const tag = ok ? 'PASS' : 'FAIL';
  const line = detail ? `${name} — ${detail}` : name;
  console.log(`[${tag}] ${line}`);
  if (ok) pass++;
  else {
    fail++;
    failDetails.push(line);
  }
}

function safeUnlink(p) {
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}

function cleanTestArtifacts() {
  safeUnlink(path.join(PATHS.phase0, `${TASK_ID}.md`));
  safeUnlink(path.join(PATHS.phase1, `${TASK_ID}.md`));
  safeUnlink(path.join(PATHS.errors, `${TASK_ID}.log`));
  // Remove any debug dumps produced for this task.
  try {
    for (const f of fs.readdirSync(PATHS.debug)) {
      if (f.startsWith(`${TASK_ID}_`)) safeUnlink(path.join(PATHS.debug, f));
    }
  } catch {
    /* ignore */
  }
}

// Pre-clean so leftover files from a previous run don't mask failures.
cleanTestArtifacts();

console.log(`=== watcher.js selftest (TASK_ID=${TASK_ID}) ===`);

// ---------- Test 1: claude ping ----------
try {
  const prompt =
    'Respond with exactly one line containing the token SELFTEST_CLAUDE_OK and nothing else.';
  const r = callClaude(prompt);
  const stdout = String(r.stdout || '');
  const ok =
    r.status === 0 && stdout.includes('SELFTEST_CLAUDE_OK') && !r.error;
  record(
    'Test 1: claude ping via stdin',
    ok,
    `exit=${r.status} stdoutLen=${stdout.length} preview=${JSON.stringify(stdout.slice(0, 160))}`,
  );
} catch (err) {
  record('Test 1: claude ping via stdin', false, `threw: ${err.message}`);
}

// ---------- Test 2: codex ping ----------
try {
  const prompt =
    'Respond with exactly one line containing the token SELFTEST_CODEX_OK and nothing else.';
  const r = callCodex(prompt);
  const stdout = String(r.stdout || '');
  const ok =
    r.status === 0 && stdout.includes('SELFTEST_CODEX_OK') && !r.error;
  record(
    'Test 2: codex ping via stdin',
    ok,
    `exit=${r.status} stdoutLen=${stdout.length} preview=${JSON.stringify(stdout.slice(0, 160))}`,
  );
} catch (err) {
  record('Test 2: codex ping via stdin', false, `threw: ${err.message}`);
}

// ---------- Test 3: phase_0 → runPhase1 → phase_1 file exists ----------
try {
  const inputPath = path.join(PATHS.phase0, `${TASK_ID}.md`);
  const outputPath = path.join(PATHS.phase1, `${TASK_ID}.md`);
  safeUnlink(outputPath);

  const taskBody = [
    '# Selftest task',
    '',
    'This is a watcher selftest. Do not modify any files. Only respond in markdown with:',
    '- A list of exactly three bullet points describing the purpose of the .harness/auto directory.',
    '- Keep the response under 20 lines total.',
  ].join('\n');
  writePhaseOutput(inputPath, taskBody);

  runPhase1(TASK_ID);

  const exists = fs.existsSync(outputPath);
  const size = exists ? fs.statSync(outputPath).size : 0;
  const ok = exists && size > 0;
  record(
    'Test 3: phase_0 → runPhase1 → phase_1/<id>.md',
    ok,
    `outputExists=${exists} size=${size}`,
  );
} catch (err) {
  record(
    'Test 3: phase_0 → runPhase1 → phase_1/<id>.md',
    false,
    `threw: ${err.message}`,
  );
}

// Always clean up so repeated runs remain deterministic.
cleanTestArtifacts();

console.log(`\n=== selftest summary: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) {
  console.log('FAIL details:');
  for (const d of failDetails) console.log(`  - ${d}`);
  process.exit(1);
} else {
  process.exit(0);
}
