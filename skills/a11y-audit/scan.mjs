#!/usr/bin/env node
/**
 * a11y-scan — standalone WCAG 2.2 scanner.
 *
 * No server, no API, no npm install. Spawns a headless browser, injects
 * axe-core, runs it, prints JSON. Works offline, on localhost, and on private
 * networks — none of which a hosted scanner will do for you.
 *
 * Usage:
 *   node scan.mjs <url> [--json] [--wait <ms>] [--browser <path>] [--timeout <ms>]
 *
 * Examples:
 *   node scan.mjs http://localhost:3000
 *   node scan.mjs https://example.com --json
 *   node scan.mjs http://localhost:8080 --wait 3000
 */

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------- arguments

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

const target = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1]?.startsWith('--') !== true);
const url = target ?? argv[0];
const asJson = has('json');
const waitMs = Number(flag('wait', 1200));
const runTimeout = Number(flag('timeout', 90000));

if (!url || url.startsWith('--')) {
  console.error('usage: node scan.mjs <url> [--json] [--wait ms] [--browser path] [--timeout ms]');
  process.exit(2);
}
if (!/^https?:\/\//i.test(url)) {
  console.error(`error: "${url}" is not an http(s) URL.`);
  process.exit(2);
}

// ------------------------------------------------------- locate the browser
// Works with: an explicit --browser, a Playwright cache, or anything on PATH.

function findBrowser() {
  const explicit = flag('browser');
  if (explicit) {
    if (!existsSync(explicit)) {
      console.error(`error: --browser path does not exist: ${explicit}`);
      process.exit(2);
    }
    return explicit;
  }

  const cacheRoot = join(homedir(), '.cache', 'ms-playwright');
  if (existsSync(cacheRoot)) {
    const candidates = [];
    for (const dir of readdirSync(cacheRoot)) {
      for (const rel of [
        'chrome-headless-shell-linux64/chrome-headless-shell',
        'chrome-linux64/chrome',
        'chrome-linux/chrome',
        'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
        'chrome-win/chrome.exe',
      ]) {
        const p = join(cacheRoot, dir, rel);
        if (existsSync(p)) candidates.push(p);
      }
    }
    // Prefer headless shell: lighter, and it is what axe wants.
    candidates.sort((a, b) => (a.includes('headless-shell') ? -1 : 1) - (b.includes('headless-shell') ? -1 : 1));
    if (candidates.length) return candidates[0];
  }

  for (const p of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
                   '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']) {
    if (existsSync(p)) return p;
  }

  console.error('error: no browser found. Install one, or pass --browser <path>.');
  process.exit(2);
}

// ---------------------------------------------------------- locate axe-core

function findAxe() {
  try {
    return require.resolve('axe-core');
  } catch {}
  const cache = join(homedir(), '.npm', '_npx');
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache)) {
      const p = join(cache, dir, 'node_modules', 'axe-core', 'axe.min.js');
      if (existsSync(p)) return p;
    }
  }
  console.error('error: axe-core not found. Run:  npm install axe-core');
  console.error('   (it will be vendored into node_modules/ next to this script)');
  process.exit(2);
}

// ------------------------------------------------------------- CDP plumbing

const browserPath = findBrowser();
const axePath = findAxe();
const axeSource = readFileSync(axePath, 'utf8');
const port = 9500 + Math.floor(Math.random() * 400);

const child = spawn(
  browserPath,
  [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--remote-debugging-port=' + port,
    '--remote-allow-origins=*',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let ws = null;
const pending = new Map();
let msgId = 0;
let closed = false;

const cleanup = (code) => {
  if (closed) process.exit(code);
  closed = true;
  clearTimeout(runTimer);
  try { ws?.close(); } catch {}
  try { child.kill('SIGKILL'); } catch {}
  // Give the OS a moment to reap the browser before we go.
  try { child.unref(); } catch {}
  setTimeout(() => process.exit(code), 50);
};

const runTimer = setTimeout(() => {
  console.error(`error: timed out after ${runTimeout}ms`);
  cleanup(1);
}, runTimeout);


const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

const fetchJson = (path) =>
  new Promise((resolve, reject) => {
    const req = fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(4000) });
    req.then((r) => r.json()).then(resolve, reject);
  });

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await fetchJson('/json/list');
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('browser did not expose a debugging target');
}

// ------------------------------------------------------------------- driver

(async () => {
  let socketUrl;
  try {
    socketUrl = await connect();
  } catch (e) {
    console.error(`error: ${e.message}`);
    cleanup(1);
  }

  ws = new WebSocket(socketUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('websocket failed'));
  });

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    const slot = pending.get(msg.id);
    if (!slot) return;
    pending.delete(msg.id);
    if (msg.error) slot.reject(new Error(msg.error.message));
    else slot.resolve(msg.result);
  };

  await send('Page.enable');
  await send('Runtime.enable');

  const loaded = new Promise((resolve) => {
    const prev = ws.onmessage;
    ws.onmessage = (ev) => {
      prev.call(ws, ev);
      try {
        const m = JSON.parse(ev.data);
        if (m.method === 'Page.loadEventFired') resolve();
      } catch {}
    };
  });

  await send('Page.navigate', { url });
  await Promise.race([loaded, new Promise((r) => setTimeout(r, 20000))]);
  await new Promise((r) => setTimeout(r, waitMs));

  // A failed navigation leaves an empty document. axe still "runs" and reports
  // violations against nothing, which reads as a real audit but is noise.
  // Catch it here rather than reporting phantom findings.
  const docState = await send('Runtime.evaluate', {
    expression: `JSON.stringify({ title: document.title, url: location.href,
       text: (document.body?.innerText || '').trim().length, nodes: document.querySelectorAll('*').length })`,
    returnByValue: true,
  });
  const doc = JSON.parse(docState?.result?.value ?? '{}');
  if (!doc.nodes) {
    console.error(`error: nothing loaded from ${url} — the page is empty or unreachable.`);
    cleanup(1);
  }
  if (doc.nodes < 5 || (doc.text === 0 && doc.title === '')) {
    console.error(`error: ${url} loaded an empty document (${doc.nodes} nodes, ` +
      `${doc.text} chars of text). Check the URL is correct and the site is up.`);
    cleanup(1);
  }

  const evaluated = await send('Runtime.evaluate', {
    expression: `${axeSource}\n;window.axe.run(document).then(r => JSON.stringify(r))`,
    awaitPromise: true,
    returnByValue: true,
  });

  const raw = evaluated?.result?.value;
  if (!raw) {
    console.error('error: axe-core returned nothing (page may be blocked or too heavy)');
    cleanup(1);
  }

  const result = JSON.parse(raw);

  if (asJson) {
    console.log(JSON.stringify({
      url: result.url,
      violations: result.violations,
      passes: result.passes?.length ?? 0,
      incomplete: result.incomplete?.length ?? 0,
      testEngine: result.testEngine,
    }, null, 2));
    // Must actually stop here: cleanup() schedules process.exit on a timer,
    // so falling through would append the human report after the JSON and
    // break every parser reading stdout.
    return cleanup(0);
  }

  // Human-readable report
  const v = result.violations;
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const x of v) byImpact[x.impact] = (byImpact[x.impact] ?? 0) + 1;

  console.log(`\n${result.url}`);
  console.log(`${v.length} violation${v.length === 1 ? '' : 's'} — ` +
    `${byImpact.critical} critical, ${byImpact.serious} serious, ` +
    `${byImpact.moderate} moderate, ${byImpact.minor} minor`);
  console.log(`axe-core ${result.testEngine?.version} · ${result.passes?.length ?? 0} rules passed\n`);

  for (const x of v) {
    console.log(`[${(x.impact ?? '?').toUpperCase()}] ${x.id} — ${x.help}`);
    console.log(`  ${x.helpUrl}`);
    console.log(`  ${x.nodes.length} instance${x.nodes.length === 1 ? '' : 's'}`);
    const n = x.nodes[0];
    if (n) {
      if (n.target) console.log(`  target: ${n.target.join(' ')}`);
      if (n.html) console.log(`  html:   ${n.html.slice(0, 120).replace(/\s+/g, ' ')}`);
      const msg = n.any?.[0]?.message ?? n.all?.[0]?.message ?? n.none?.[0]?.message;
      if (msg) console.log(`  why:    ${msg.slice(0, 200)}`);
    }
    console.log();
  }

  if (v.length === 0) console.log('No automated violations found.\n');
  cleanup(0);
})().catch((e) => {
  console.error(`error: ${e.message}`);
  cleanup(1);
});

process.on('SIGINT', () => cleanup(130));
