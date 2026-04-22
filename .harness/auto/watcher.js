// Kitchen Flow Automation Harness — Watcher
// File-system orchestrator for the 11-step Codex ↔ Claude Code relay.
// Place tasks in phase_0/<TASK_ID>.md. Approve gates in approvals/.
// All runtime output lives under .harness/auto/.

import chokidar from 'chokidar';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HARNESS_DIR = __dirname;
const CONFIG_PATH = path.join(HARNESS_DIR, 'config.json');

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
const BASE = config.basePath;
const HARNESS = config.harnessPath;
const IS_WIN = process.platform === 'win32';

const PATHS = {
  phase0: path.join(HARNESS, 'phase_0'),
  phase1: path.join(HARNESS, 'phase_1'),
  phase2: path.join(HARNESS, 'phase_2'),
  phase3: path.join(HARNESS, 'phase_3'),
  phase4: path.join(HARNESS, 'phase_4'),
  phase5: path.join(HARNESS, 'phase_5'),
  approvals: path.join(HARNESS, 'approvals'),
  errors: path.join(HARNESS, 'errors'),
  debug: path.join(HARNESS, 'debug'),
  prompts: path.join(HARNESS, 'prompts'),
  registry: path.join(HARNESS, 'registry.json'),
  busy: path.join(HARNESS, 'WATCHER_BUSY'),
};

// ---------- Logger ----------
function ts() {
  return new Date().toISOString();
}
function log(msg) {
  const line = `[${ts()}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(path.join(PATHS.debug, '_watcher.log'), line + '\n');
  } catch {
    /* ignore */
  }
}

// ---------- Atomic file helpers ----------
// Reserved for state files (registry.json, WATCHER_BUSY) that are NOT watched by
// chokidar. Do NOT use this for phase output — tmp→rename under polling +
// awaitWriteFinish can cause chokidar to miss the 'add' event.
function atomicWrite(target, content) {
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, target);
}

// Direct single-shot writer for paths WATCHED by chokidar (phase_0..5, approvals).
// Avoids the rename pattern so awaitWriteFinish can settle on a stable file and
// consistently fire an 'add' event. Logs size for diagnostic tracing.
function writePhaseOutput(target, content) {
  fs.writeFileSync(target, content);
  try {
    const sz = fs.statSync(target).size;
    log(`[write] ${path.relative(HARNESS, target)} saved, ${sz} bytes`);
  } catch {
    /* ignore */
  }
}

function readIfExists(p) {
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return null;
  }
}

// ---------- Registry (task state) ----------
function loadRegistry() {
  const raw = readIfExists(PATHS.registry);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    log('[registry] JSON parse failed — trying .bak');
    const bak = readIfExists(PATHS.registry + '.bak');
    if (bak) return JSON.parse(bak);
    return {};
  }
}
function saveRegistry(reg) {
  try {
    if (fs.existsSync(PATHS.registry)) {
      fs.copyFileSync(PATHS.registry, PATHS.registry + '.bak');
    }
  } catch {
    /* ignore */
  }
  atomicWrite(PATHS.registry, JSON.stringify(reg, null, 2));
}
function updateTask(taskId, patch) {
  const reg = loadRegistry();
  reg[taskId] = { ...(reg[taskId] || {}), ...patch, updatedAt: ts() };
  saveRegistry(reg);
  return reg[taskId];
}

// ---------- BUSY flag ----------
function setBusy(taskId, phase) {
  atomicWrite(PATHS.busy, JSON.stringify({ taskId, phase, since: ts() }));
}
function clearBusy() {
  try {
    if (fs.existsSync(PATHS.busy)) fs.unlinkSync(PATHS.busy);
  } catch {
    /* ignore */
  }
}

// ---------- Template engine ----------
function loadRulesText() {
  const parts = [];
  for (const rel of config.rulesRouting.always || []) {
    const full = path.join(BASE, rel);
    const body = readIfExists(full);
    if (body) parts.push(`### ${rel}\n${body}`);
  }
  return parts.join('\n\n');
}
function loadLearnings(role) {
  const rel = config.learningsFiles[role];
  if (!rel) return '';
  const body = readIfExists(path.join(BASE, rel));
  return body ? `### ${rel}\n${body}` : '';
}
function loadMistakes(role) {
  const rel = config.mistakesFiles[role];
  if (!rel) return '';
  const body = readIfExists(path.join(BASE, rel));
  return body ? `### ${rel}\n${body}` : '';
}
function loadPhaseContent(taskId, phase) {
  const body = readIfExists(path.join(PATHS[`phase${phase}`], `${taskId}.md`));
  return body || '';
}
function renderTemplate(templateName, vars) {
  const tplPath = path.join(PATHS.prompts, templateName);
  let tpl = fs.readFileSync(tplPath, 'utf-8');
  for (const [k, v] of Object.entries(vars)) {
    tpl = tpl.split(`{{${k}}}`).join(v ?? '');
  }
  return tpl;
}
function writeDebug(taskId, phase, engine, prompt) {
  const file = path.join(PATHS.debug, `${taskId}_phase${phase}_${engine}.txt`);
  try {
    fs.writeFileSync(file, prompt);
  } catch (err) {
    log(`[debug] write failed: ${err.message}`);
  }
}

// ---------- CLI wrapper ----------
const binCache = {};
function resolveBinary(binBase) {
  if (binCache[binBase]) return binCache[binBase];
  if (!IS_WIN) {
    binCache[binBase] = binBase;
    return binBase;
  }
  // Windows: actual extension varies (.exe native, .cmd npm shim, .bat rare).
  // Use `where.exe` to discover candidates; prefer .exe > .cmd > .bat.
  // IMPORTANT: Do NOT fall back to the first line — `where` also lists the
  // extensionless POSIX shell script (e.g. C:\...\npm\codex) that spawnSync
  // cannot execute on Windows, causing ENOENT. codex is a .cmd-only shim so
  // without this preference codex resolves to the bare script and fails.
  const w = spawnSync('where.exe', [binBase], { encoding: 'utf-8', shell: false });
  if (w.status === 0 && w.stdout && w.stdout.trim()) {
    const lines = w.stdout.trim().split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const byExt = (re) => lines.find((l) => re.test(l));
    binCache[binBase] =
      byExt(/\.exe$/i) ||
      byExt(/\.cmd$/i) ||
      byExt(/\.bat$/i) ||
      `${binBase}.cmd`;
  } else {
    binCache[binBase] = `${binBase}.cmd`;
  }
  log(`[cli] resolved ${binBase} → ${binCache[binBase]}`);
  return binCache[binBase];
}

function summarizeArgs(args) {
  return args
    .map((a, i) => {
      const s = String(a);
      if (s.length <= 80) return `[${i}] ${JSON.stringify(s)}`;
      return `[${i}] (len=${s.length}) ${JSON.stringify(s.slice(0, 60))}…${JSON.stringify(s.slice(-20))}`;
    })
    .join(' ');
}

// stdinInput: when provided, the prompt is piped via stdin instead of being
// passed as a shell argument. Required because Windows cmd.exe truncates
// arguments past ~32KB (cmd.exe hard cap 8191 chars; spawn bypasses cmd
// normally but Windows kernel still caps at 32K). Large prompts that inline
// LEARNINGS / MISTAKES / RULES_FILES plus accumulated phase output easily
// exceed that, producing silent truncation or spawn failures. stdin delivery
// has no such limit.
function callCLI(engine, args, stdinInput = null) {
  const binBase = config.cliBinaries[engine];
  const binName = resolveBinary(binBase);
  const stdinInfo = stdinInput != null ? ` stdin=${Buffer.byteLength(stdinInput, 'utf-8')}B` : '';
  log(`[cli] ${binName} cwd=${BASE}${stdinInfo} args: ${summarizeArgs(args)}`);
  const started = Date.now();
  const spawnOpts = {
    encoding: 'utf-8',
    shell: false,
    timeout: config.timeouts[engine],
    maxBuffer: 50 * 1024 * 1024,
    cwd: BASE,
  };
  if (stdinInput != null) spawnOpts.input = stdinInput;
  const result = spawnSync(binName, args, spawnOpts);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const errMsg = result.error ? ` error=${result.error.code || ''}:${result.error.message}` : '';
  const sig = result.signal ? ` signal=${result.signal}` : '';
  const stderrPreview = result.stderr ? ` stderr(first200)=${JSON.stringify(String(result.stderr).slice(0, 200))}` : '';
  log(`[cli] ${engine} exit=${result.status} elapsed=${elapsed}s${sig}${errMsg}${stderrPreview}`);
  return result;
}
// Claude Code CLI reads the prompt from stdin when `-p` is passed without a
// positional prompt argument.
function callClaude(prompt) {
  return callCLI(
    'claude',
    ['-p', '--permission-mode', 'acceptEdits', '--output-format', 'text'],
    prompt,
  );
}
// Codex CLI convention: `codex exec -` reads the prompt from stdin. If a
// particular codex build rejects the dash arg the fallback is `['exec']` with
// stdin still piped — selftest validates which form works.
function callCodex(prompt) {
  return callCLI('codex', ['exec', '-'], prompt);
}

// ---------- Error logging ----------
function logError(taskId, phase, engine, err, result) {
  const file = path.join(PATHS.errors, `${taskId}.log`);
  const lines = [
    '---',
    `[${ts()}] Phase ${phase} 실패`,
    `엔진: ${engine}`,
    `종료코드: ${result ? result.status : 'n/a'}`,
    result && result.signal ? `signal: ${result.signal}` : '',
    result && result.error
      ? `spawn error: ${result.error.code || ''} ${result.error.message}${result.error.path ? ' path=' + result.error.path : ''}${result.error.syscall ? ' syscall=' + result.error.syscall : ''}`
      : '',
    result && result.stderr ? `stderr:\n${String(result.stderr).slice(0, 4000)}` : '',
    result && result.stdout ? `stdout(first 1KB):\n${String(result.stdout).slice(0, 1024)}` : '',
    err ? `caught error: ${err.message}` : '',
    '---',
    '',
  ].filter(Boolean);
  try {
    fs.appendFileSync(file, lines.join('\n'));
  } catch {
    /* ignore */
  }
}

// ---------- Retry wrapper ----------
function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* busy-wait for small backoffs in sync context */
  }
}
function withRetry(taskId, phase, engine, fn) {
  const max = config.retries.maxPerPhase;
  let lastErr = null;
  let lastResult = null;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      const r = fn();
      if (r && r.status === 0) return r;
      lastResult = r;
      logError(taskId, phase, engine, null, r);
      log(`[retry] ${taskId} phase${phase} attempt ${attempt}/${max} failed`);
    } catch (err) {
      lastErr = err;
      logError(taskId, phase, engine, err, null);
    }
    if (attempt < max) sleep(config.retries.backoffMs);
  }
  const e = new Error(
    `Phase ${phase} failed after ${max} attempts (engine=${engine})`,
  );
  e.last = { err: lastErr, result: lastResult };
  throw e;
}

// ---------- Approval gate ----------
function createApprovalPending(taskId) {
  const pending = path.join(PATHS.approvals, `${taskId}.pending`);
  const phase3 = loadPhaseContent(taskId, 3);
  const body = [
    `# 승인 대기: ${taskId}`,
    '',
    '이 태스크의 Phase 3 검토가 완료되었습니다.',
    '',
    '- 승인: 이 파일 이름을 `.approved`로 변경하거나 `<TASK_ID>.approved` 파일을 생성하세요.',
    '- 거부: `<TASK_ID>.rejected` 파일을 생성하고 사유를 안에 기재하세요.',
    '',
    '## Phase 3 검토 전문',
    '',
    phase3,
  ].join('\n');
  writePhaseOutput(pending, body);
  updateTask(taskId, { status: 'awaiting_approval', pendingSince: ts() });
  log(`[gate] ${taskId}: awaiting approval`);
}

// ---------- Learnings append ----------
function extractLearningLine(phase5Text) {
  const m = phase5Text.match(/##\s*이번 세션 학습 한 줄\s*\n([\s\S]*?)(\n##|$)/);
  if (!m) return null;
  return m[1].trim().split('\n')[0].trim();
}
function appendLearnings(taskId, phase5Text) {
  const line = extractLearningLine(phase5Text);
  if (!line) {
    log(`[learnings] ${taskId}: 학습 한 줄 섹션 없음, skip`);
    return;
  }
  const target = path.join(BASE, config.learningsFiles.worker);
  const entry = `\n- ${ts()} (${taskId}) ${line}\n`;
  try {
    fs.appendFileSync(target, entry);
    log(`[learnings] ${taskId}: appended → ${config.learningsFiles.worker}`);
  } catch (err) {
    log(`[learnings] append failed: ${err.message}`);
  }
}

// ---------- Regression tests (Phase 5 input) ----------
function runRegression() {
  const results = [];
  const npm = IS_WIN ? 'npm.cmd' : 'npm';
  for (const script of ['build', 'test']) {
    const r = spawnSync(npm, ['run', script], {
      encoding: 'utf-8',
      shell: false,
      cwd: BASE,
      timeout: 600000,
      maxBuffer: 20 * 1024 * 1024,
    });
    results.push(
      `### npm run ${script}\nexit=${r.status}\n` +
        `stdout(last 2KB):\n${String(r.stdout || '').slice(-2048)}\n` +
        `stderr(last 1KB):\n${String(r.stderr || '').slice(-1024)}`,
    );
  }
  return results.join('\n\n');
}

// ---------- Phase 3 split-plan parsing ----------
function parseSplitPlan(phase3Text) {
  if (!phase3Text) return { split: false, steps: [] };
  const splitMatch = phase3Text.match(/##\s*분할\s*실행[^\n]*\n([\s\S]*?)(?=\n##\s|$)/);
  if (!splitMatch) return { split: false, steps: [] };
  const body = splitMatch[1];
  const needSplit = /분할\s*필요\s*[:：]\s*yes/i.test(body);
  if (!needSplit) return { split: false, steps: [] };

  const stepRe = /####\s*step[_\s]*(\d+)\s*\n([\s\S]*?)(?=\n####\s|\n###\s|\n##\s|$)/g;
  const steps = [];
  let m;
  while ((m = stepRe.exec(body)) !== null) {
    const n = parseInt(m[1], 10);
    const stepBody = m[2].trim();
    const pick = (label) => {
      const re = new RegExp(`[-*]\\s*${label}\\s*[:：]\\s*(.+)`);
      const mm = stepBody.match(re);
      return mm ? mm[1].trim() : '';
    };
    steps.push({
      n,
      body: stepBody,
      prereq: pick('전제\\s*조건'),
      goal: pick('목표'),
      deliverable: pick('산출물'),
    });
  }
  steps.sort((a, b) => a.n - b.n);
  const cap = config.phase4?.maxSteps ?? 12;
  if (steps.length > cap) {
    log(`[split] step count ${steps.length} exceeds cap ${cap}, truncating`);
    steps.length = cap;
  }
  return { split: steps.length > 0, steps };
}

function extractMidVerdict(reviewText) {
  if (!reviewText) return '계속';
  const m = reviewText.match(/##\s*중간\s*판정\s*\n\s*\[?\s*(계속|중단|재작업)\s*\]?/);
  return m ? m[1] : '계속';
}

// ---------- Phase handlers ----------
function handlePhase(taskId, phase, engine, template, extraVars = {}) {
  setBusy(taskId, phase);
  updateTask(taskId, { status: `phase_${phase}_running` });
  const vars = {
    TASK_ID: taskId,
    ORIGINAL_REQUEST: loadPhaseContent(taskId, 0),
    PHASE_1_CONTENT: loadPhaseContent(taskId, 1),
    PHASE_2_CONTENT: loadPhaseContent(taskId, 2),
    PHASE_3_CONTENT: loadPhaseContent(taskId, 3),
    PHASE_4_CONTENT: loadPhaseContent(taskId, 4),
    PHASE_5_CONTENT: loadPhaseContent(taskId, 5),
    RULES_FILES: loadRulesText(),
    LEARNINGS: loadLearnings(engine === 'codex' ? 'commander' : 'worker'),
    MISTAKES: loadMistakes(engine === 'codex' ? 'commander' : 'worker'),
    ...extraVars,
  };
  const prompt = renderTemplate(template, vars);
  writeDebug(taskId, phase, engine, prompt);
  const callFn = engine === 'codex' ? callCodex : callClaude;
  try {
    const result = withRetry(taskId, phase, engine, () => callFn(prompt));
    const outFile = path.join(PATHS[`phase${phase}`], `${taskId}.md`);
    writePhaseOutput(outFile, result.stdout || '');
    updateTask(taskId, { status: `phase_${phase}_done` });
    log(`[phase ${phase}] ${taskId}: done`);
  } finally {
    clearBusy();
  }
}

function runPhase1(taskId) {
  handlePhase(taskId, 1, 'claude', 'phase_1_explore.txt');
}
function runPhase2(taskId) {
  handlePhase(taskId, 2, 'claude', 'phase_2_plan.txt');
}
function runPhase3(taskId) {
  handlePhase(taskId, 3, 'codex', 'phase_3_review.txt');
  if (config.approval.requiredPhases.includes('phase_3')) {
    createApprovalPending(taskId);
  } else {
    runPhase4(taskId);
  }
}
function runPhase4Single(taskId) {
  handlePhase(taskId, 4, 'claude', 'phase_4_execute.txt');
}

function runPhase4Split(taskId, steps) {
  setBusy(taskId, 4);
  updateTask(taskId, {
    status: 'phase_4_running',
    mode: 'split',
    totalSteps: steps.length,
    currentStep: 0,
  });
  const phase3Text = loadPhaseContent(taskId, 3);
  const stepResults = [];
  try {
    for (const step of steps) {
      log(`[phase 4] ${taskId}: step ${step.n}/${steps.length}`);
      updateTask(taskId, { currentStep: step.n });

      const prevBlocks = stepResults.map(
        (r) => `### step_${r.n} 결과\n${r.content}`,
      );
      const prevContent = prevBlocks.length ? prevBlocks.join('\n\n') : '(없음 — 이번이 첫 step)';

      const stepPrompt = renderTemplate('phase_4_execute_step.txt', {
        TASK_ID: taskId,
        STEP_NUMBER: String(step.n),
        STEP_PREREQ: step.prereq || '(명시 없음)',
        STEP_GOAL: step.goal || step.body,
        STEP_DELIVERABLE: step.deliverable || '(명시 없음)',
        PREVIOUS_STEPS_CONTENT: prevContent,
        ORIGINAL_REQUEST: loadPhaseContent(taskId, 0),
        PHASE_2_CONTENT: loadPhaseContent(taskId, 2),
        PHASE_3_CONTENT: phase3Text,
        LEARNINGS: loadLearnings('worker'),
        MISTAKES: loadMistakes('worker'),
        RULES_FILES: loadRulesText(),
      });
      writeDebug(taskId, 4, `claude_step${step.n}`, stepPrompt);
      const stepResult = withRetry(taskId, 4, 'claude', () => callClaude(stepPrompt));
      const stepOutPath = path.join(PATHS.phase4, `${taskId}_step${step.n}.md`);
      const stepBody = stepResult.stdout || '';
      writePhaseOutput(stepOutPath, stepBody);
      stepResults.push({ n: step.n, content: stepBody });

      const isLast = step.n === steps[steps.length - 1].n;
      if (config.phase4?.midReview && !isLast) {
        const nextStep = steps[steps.findIndex((s) => s.n === step.n) + 1];
        const reviewPrompt = renderTemplate('phase_4_midreview.txt', {
          TASK_ID: taskId,
          STEP_NUMBER: String(step.n),
          STEP_GOAL: step.goal || step.body,
          STEP_RESULT: stepBody,
          NEXT_STEP_GOAL: nextStep ? nextStep.goal || nextStep.body : '(없음)',
          LEARNINGS: loadLearnings('commander'),
        });
        writeDebug(taskId, 4, `codex_review_step${step.n}`, reviewPrompt);
        const reviewResult = withRetry(taskId, 4, 'codex', () => callCodex(reviewPrompt));
        const reviewBody = reviewResult.stdout || '';
        writePhaseOutput(
          path.join(PATHS.phase4, `${taskId}_step${step.n}_review.md`),
          reviewBody,
        );
        const verdict = extractMidVerdict(reviewBody);
        log(`[phase 4] ${taskId}: step ${step.n} mid-verdict=${verdict}`);
        if (verdict === '중단') {
          throw new Error(`mid-review 중단 at step ${step.n}`);
        }
        if (verdict === '재작업') {
          log(`[phase 4] ${taskId}: step ${step.n} rework requested, retrying once`);
          const retryResult = withRetry(taskId, 4, 'claude', () => callClaude(stepPrompt));
          const retryBody = retryResult.stdout || '';
          writePhaseOutput(stepOutPath, retryBody);
          stepResults[stepResults.length - 1].content = retryBody;
        }
      }
    }

    const combined = [
      `# ${taskId} — Phase 4 분할 실행 결과`,
      '',
      `총 ${steps.length} step 완료.`,
      '',
      ...stepResults.map((r) => `## step_${r.n}\n\n${r.content}`),
    ].join('\n\n');
    writePhaseOutput(path.join(PATHS.phase4, `${taskId}.md`), combined);
    updateTask(taskId, { status: 'phase_4_done' });
    log(`[phase 4] ${taskId}: split execution done (${steps.length} steps)`);
  } finally {
    clearBusy();
  }
}

function runPhase4(taskId) {
  if (!config.phase4?.allowSplit) {
    runPhase4Single(taskId);
    return;
  }
  const phase3Text = loadPhaseContent(taskId, 3);
  const plan = parseSplitPlan(phase3Text);
  if (!plan.split) {
    log(`[phase 4] ${taskId}: single-run mode`);
    runPhase4Single(taskId);
    return;
  }
  log(`[phase 4] ${taskId}: split mode, ${plan.steps.length} steps`);
  runPhase4Split(taskId, plan.steps);
}
function runPhase5(taskId) {
  const buildResult = runRegression();
  handlePhase(taskId, 5, 'codex', 'phase_5_verify.txt', {
    BUILD_TEST_RESULT: buildResult,
  });
  const phase5Text = loadPhaseContent(taskId, 5);
  appendLearnings(taskId, phase5Text);
  updateTask(taskId, { status: 'completed', completedAt: ts() });
  log(`[phase 5] ${taskId}: completed`);
}

// ---------- Task queue (serial processing) ----------
let queue = Promise.resolve();
function enqueue(label, fn) {
  queue = queue.then(async () => {
    try {
      await fn();
    } catch (err) {
      log(`[queue] ${label} failed: ${err.message}`);
    }
  });
  return queue;
}

// ---------- Event dispatch ----------
function taskIdFromFile(filePath) {
  const base = path.basename(filePath);
  if (!base.endsWith('.md')) return null;
  return base.slice(0, -3);
}
function approvalIdFromFile(filePath) {
  const base = path.basename(filePath);
  const m = base.match(/^(.+)\.(approved|rejected|pending)$/);
  return m ? { id: m[1], kind: m[2] } : null;
}

function dispatchAdd(filePath) {
  const rel = path.relative(HARNESS, filePath);
  const topDir = rel.split(path.sep)[0];

  if (topDir === 'phase_0') {
    const id = taskIdFromFile(filePath);
    if (!id || id === '.gitkeep') return;
    enqueue(`phase1:${id}`, () => {
      updateTask(id, { status: 'received', receivedAt: ts() });
      log(`[phase 0] ${id}: received`);
      runPhase1(id);
    });
    return;
  }
  if (topDir === 'phase_1') {
    const id = taskIdFromFile(filePath);
    if (id) enqueue(`phase2:${id}`, () => runPhase2(id));
    return;
  }
  if (topDir === 'phase_2') {
    const id = taskIdFromFile(filePath);
    if (id) enqueue(`phase3:${id}`, () => runPhase3(id));
    return;
  }
  // phase_3 output does not auto-trigger; approval gate is used.
  if (topDir === 'approvals') {
    const info = approvalIdFromFile(filePath);
    if (!info || info.kind === 'pending') return;
    if (info.kind === 'approved') {
      enqueue(`phase4:${info.id}`, () => runPhase4(info.id));
    } else if (info.kind === 'rejected') {
      enqueue(`phase2-retry:${info.id}`, () => {
        const stale = path.join(PATHS.phase2, `${info.id}.md`);
        try {
          if (fs.existsSync(stale)) fs.unlinkSync(stale);
        } catch {
          /* ignore */
        }
        log(`[gate] ${info.id}: rejected, re-running Phase 2`);
        runPhase2(info.id);
      });
    }
    return;
  }
  if (topDir === 'phase_4') {
    const id = taskIdFromFile(filePath);
    if (!id) return;
    // Split-mode intermediate files like "<id>_step1.md" / "<id>_step1_review.md"
    // must not trigger Phase 5; only the combined "<id>.md" does.
    if (/_step\d+(_review)?$/.test(id)) return;
    enqueue(`phase5:${id}`, () => runPhase5(id));
    return;
  }
}

// ---------- Recovery on startup ----------
function detectLastCompletedPhase(taskId) {
  for (let p = 5; p >= 1; p--) {
    if (fs.existsSync(path.join(PATHS[`phase${p}`], `${taskId}.md`))) return p;
  }
  return 0;
}
function recoverOnStartup() {
  const reg = loadRegistry();
  for (const [taskId, task] of Object.entries(reg)) {
    if (task.status === 'completed') continue;
    if (task.status === 'awaiting_approval') {
      log(`[recover] ${taskId}: awaiting_approval (kept)`);
      continue;
    }
    if (task.status && task.status.endsWith('_running')) {
      const last = detectLastCompletedPhase(taskId);
      const next = last + 1;
      log(`[recover] ${taskId}: resuming at phase ${next}`);
      if (next === 1) enqueue(`recover-1:${taskId}`, () => runPhase1(taskId));
      else if (next === 2) enqueue(`recover-2:${taskId}`, () => runPhase2(taskId));
      else if (next === 3) enqueue(`recover-3:${taskId}`, () => runPhase3(taskId));
      else if (next === 4) enqueue(`recover-4:${taskId}`, () => runPhase4(taskId));
      else if (next === 5) enqueue(`recover-5:${taskId}`, () => runPhase5(taskId));
    }
  }
}

// ---------- Main ----------
function main() {
  clearBusy();
  for (const key of ['phase0', 'phase1', 'phase2', 'phase3', 'phase4', 'phase5', 'approvals', 'errors', 'debug']) {
    if (!fs.existsSync(PATHS[key])) fs.mkdirSync(PATHS[key], { recursive: true });
  }
  log(`[main] watcher starting (base=${BASE})`);
  log(`[main] harness=${HARNESS}`);
  recoverOnStartup();

  const watcher = chokidar.watch(
    [PATHS.phase0, PATHS.phase1, PATHS.phase2, PATHS.phase3, PATHS.phase4, PATHS.approvals],
    {
      ignoreInitial: true,
      usePolling: true,
      interval: config.pollingInterval,
      awaitWriteFinish: {
        stabilityThreshold: config.stabilityThreshold,
        pollInterval: 100,
      },
    },
  );
  // Diagnostic: log every chokidar event so we can see whether an 'add' was
  // missed (e.g. when atomicWrite's rename collides with awaitWriteFinish).
  watcher.on('all', (event, p) => {
    log(`[chokidar] ${event} ${path.relative(HARNESS, p)}`);
  });
  watcher.on('add', (p) => {
    log(`[event] add ${path.relative(HARNESS, p)}`);
    dispatchAdd(p);
  });
  watcher.on('error', (err) => log(`[watcher] error ${err.message}`));
  log('[main] ready. drop tasks in phase_0/<TASK_ID>.md');

  process.on('SIGINT', () => {
    log('[main] SIGINT received, closing');
    clearBusy();
    watcher.close().then(() => process.exit(0));
  });
}

// Run main() only when this file is invoked directly (node watcher.js).
// When imported as a module (e.g. from selftest.js) skip main() so the
// importer can call individual functions without booting chokidar.
const invokedDirectly = (() => {
  try {
    return path.resolve(process.argv[1] || '') === __filename;
  } catch {
    return false;
  }
})();
if (invokedDirectly) {
  main();
}

export {
  config,
  PATHS,
  resolveBinary,
  callCLI,
  callClaude,
  callCodex,
  writePhaseOutput,
  loadPhaseContent,
  renderTemplate,
  parseSplitPlan,
  extractMidVerdict,
  runPhase1,
  runPhase2,
  runPhase3,
  runPhase4,
  runPhase4Single,
  runPhase4Split,
  runPhase5,
  dispatchAdd,
  handlePhase,
};
