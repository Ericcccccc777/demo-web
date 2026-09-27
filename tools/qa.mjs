#!/usr/bin/env node
/*
 * QA + screenshot tool for the studio showcase. Node 22+ (built-in WebSocket), Google Chrome, no npm packages.
 *
 * Serves ./site on a local port, drives headless Chrome over the DevTools Protocol and, for every page/viewport:
 *   - records uncaught exceptions, console errors, failed requests and non-allowed external requests
 *   - measures unexpected horizontal overflow, h1 count, kit/meta presence
 *   - (demos) tries a 30-character "Try it on" business name and re-checks overflow
 *   - saves a JPEG screenshot you can look at
 *
 * Examples
 *   node tools/qa.mjs --ids 001,014                    # check two demos at 390x844 and 1440x900
 *   node tools/qa.mjs --all --out evidence/qa           # every demo
 *   node tools/qa.mjs --ids 007 --eval "document.querySelector('button').click()" --label clicked
 *   node tools/qa.mjs --ids 007 --reduced               # emulate prefers-reduced-motion: reduce
 *   node tools/qa.mjs --pages index.html,zh/index.html --viewports 320x640,390x844,768x1024,1024x768,1440x900
 *   node tools/qa.mjs --all --thumbs --sprite           # regenerate site/assets/thumbs/*.webp and the hero sprite
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, existsSync, statSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname, resolve, dirname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ALLOWED_EXTERNAL = [/^https:\/\/fonts\.googleapis\.com\//, /^https:\/\/fonts\.gstatic\.com\//];
const TEST_BRAND = "Rosie's Bakery & Catering Co."; // 29 characters, apostrophe + ampersand on purpose

/* ---------------- args ---------------- */
function parseArgs(argv) {
  const a = { viewports: "390x844,1440x900", out: "evidence/qa", concurrency: 1, wait: 900, timeout: 30000 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === "--ids") a.ids = v().split(",").map((s) => s.trim()).filter(Boolean);
    else if (k === "--all") a.all = true;
    else if (k === "--pages") a.pages = v().split(",").map((s) => s.trim()).filter(Boolean);
    else if (k === "--viewports") a.viewports = v();
    else if (k === "--out") a.out = v();
    else if (k === "--eval") a.eval = v();
    else if (k === "--label") a.label = v();
    else if (k === "--wait") a.wait = Number(v());
    else if (k === "--concurrency") a.concurrency = Math.max(1, Number(v()));
    else if (k === "--reduced") a.reduced = true;
    else if (k === "--thumbs") a.thumbs = true;
    else if (k === "--sprite") a.sprite = true;
    else if (k === "--no-shots") a.noShots = true;
    else if (k === "--no-brand") a.noBrand = true;
    else if (k === "--full") a.full = true;
    else if (k === "--sheet") a.sheet = v();
    else if (k === "--keys") a.keys = v();
    else if (k === "--dense") a.dense = true;
    else if (k === "--help" || k === "-h") a.help = true;
    else throw new Error("Unknown argument: " + k);
  }
  a.viewports = a.viewports.split(",").map((s) => {
    const [w, h] = s.toLowerCase().split("x").map(Number);
    if (!w || !h) throw new Error("Bad viewport " + s);
    return { w, h };
  });
  return a;
}

/* ---------------- static server ---------------- */
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8",
  ".woff2": "font/woff2", ".woff": "font/woff", ".mp3": "audio/mpeg", ".wav": "audio/wav",
};
function startServer(extraRoutes = {}) {
  return new Promise((ok) => {
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url, "http://x");
        if (extraRoutes[url.pathname]) {
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          res.end(extraRoutes[url.pathname]);
          return;
        }
        let p = decodeURIComponent(url.pathname);
        let base = SITE;
        if (p.startsWith("/__root/")) { base = ROOT; p = p.slice(7); }
        let file = normalize(join(base, p));
        if (!file.startsWith(base)) { res.writeHead(403); res.end(); return; }
        if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
        if (!existsSync(file)) { res.writeHead(404, { "content-type": "text/plain" }); res.end("404"); return; }
        res.writeHead(200, { "content-type": TYPES[extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
        res.end(readFileSync(file));
      } catch (e) {
        res.writeHead(500); res.end(String(e));
      }
    });
    server.listen(0, "127.0.0.1", () => ok(server));
  });
}

/* ---------------- chrome + CDP ---------------- */
async function launchChrome() {
  const profile = mkdtempSync(join(tmpdir(), "hd-qa-chrome-"));
  const proc = spawn(CHROME, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run",
    "--no-default-browser-check", "--hide-scrollbars", "--mute-audio", "--enable-unsafe-swiftshader",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-extensions",
    "--autoplay-policy=user-gesture-required", "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  proc.stderr.on("data", () => {});
  const portFile = join(profile, "DevToolsActivePort");
  const started = Date.now();
  while (!existsSync(portFile)) {
    if (Date.now() - started > 20000) throw new Error("Chrome did not start (no DevToolsActivePort). Is Chrome installed at " + CHROME + "?");
    await sleep(100);
  }
  let lines = [];
  while (lines.length < 2) { lines = readFileSync(portFile, "utf8").trim().split("\n"); if (lines.length < 2) await sleep(50); }
  const ws = new WebSocket(`ws://127.0.0.1:${lines[0]}${lines[1]}`);
  await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
  const cdp = new CDP(ws);
  return { cdp, close: () => { try { ws.close(); } catch {} ; try { proc.kill("SIGKILL"); } catch {} ; setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 300); } };
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = new Set();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { ok, bad } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? bad(new Error(msg.error.message + (msg.error.data ? " " + msg.error.data : ""))) : ok(msg.result);
      } else if (msg.method) {
        for (const l of this.listeners) l(msg);
      }
    };
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((ok, bad) => this.pending.set(id, { ok, bad }));
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Only the front tab reliably produces frames in headless Chrome, so screenshots are taken one at a time.
let frontLock = Promise.resolve();
function withFront(fn) {
  const run = frontLock.then(fn, fn);
  frontLock = run.catch(() => {});
  return run;
}
function withTimeout(p, ms, what) {
  let t;
  const timer = new Promise((_, bad) => { t = setTimeout(() => bad(new Error("Timeout: " + what)), ms); });
  return Promise.race([p, timer]).finally(() => clearTimeout(t));
}

/* ---------------- page check ---------------- */
async function checkPage(cdp, origin, job, args) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => cdp.send(m, p, sessionId);
  const result = { url: job.url, viewport: `${job.vp.w}x${job.vp.h}`, errors: [], external: [], failed: [] };
  let loadResolve;
  const loaded = new Promise((r) => (loadResolve = r));
  const off = cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    const p = msg.params || {};
    if (msg.method === "Page.loadEventFired") loadResolve();
    else if (msg.method === "Runtime.exceptionThrown") {
      const d = p.exceptionDetails || {};
      result.errors.push("exception: " + ((d.exception && d.exception.description) || d.text || "unknown").split("\n")[0] + (d.lineNumber != null ? ` @${d.lineNumber + 1}:${(d.columnNumber || 0) + 1}` : ""));
    } else if (msg.method === "Runtime.consoleAPICalled" && p.type === "error") {
      result.errors.push("console.error: " + (p.args || []).map((x) => x.value ?? x.description ?? "").join(" ").slice(0, 300));
    } else if (msg.method === "Log.entryAdded" && p.entry && p.entry.level === "error") {
      const e = p.entry;
      if (!/favicon\.ico/.test(e.url || "")) result.errors.push("log: " + e.text + (e.url ? " " + e.url : ""));
    } else if (msg.method === "Network.requestWillBeSent") {
      const u = p.request.url;
      if (/^(data|blob|about|chrome-extension):/.test(u) || u.startsWith(origin)) return;
      if (!ALLOWED_EXTERNAL.some((re) => re.test(u))) result.external.push(u);
    } else if (msg.method === "Network.loadingFailed") {
      if (!p.canceled) result.failed.push(p.errorText + (p.blockedReason ? " (" + p.blockedReason + ")" : ""));
    }
  });
  try {
    await Promise.all([s("Page.enable"), s("Runtime.enable"), s("Log.enable"), s("Network.enable")]);
    await s("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});
    const mobile = job.vp.w < 600;
    await s("Emulation.setDeviceMetricsOverride", { width: job.vp.w, height: job.vp.h, deviceScaleFactor: job.dsf || 1, mobile });
    await s("Emulation.setTouchEmulationEnabled", mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    await s("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: args.reduced ? "reduce" : "no-preference" }, { name: "prefers-color-scheme", value: "light" }] });
    await s("Page.navigate", { url: job.url });
    await withTimeout(loaded, args.timeout, "load " + job.url).catch((e) => result.errors.push(String(e.message)));
    await withTimeout(s("Runtime.evaluate", { expression: "Promise.race([document.fonts ? document.fonts.ready.then(()=>1) : 1, new Promise(r=>setTimeout(r,5000))])", awaitPromise: true }), 8000, "fonts").catch(() => {});
    await sleep(args.wait);
    if (args.eval) {
      const r = await withTimeout(s("Runtime.evaluate", { expression: `(async()=>{${args.eval}\n})()`, awaitPromise: true, userGesture: true }), 20000, "eval").catch((e) => ({ exceptionDetails: { text: e.message } }));
      if (r && r.exceptionDetails) result.errors.push("eval failed: " + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
      await sleep(Math.max(400, args.wait));
    }
    if (args.keys) {
      // real key events (not synthetic JS events): "Tab*6,Enter,wait:1500,Escape,Shift+Tab"
      const KEYS = { Tab: [9, "Tab"], Enter: [13, "Enter"], Escape: [27, "Escape"], Space: [32, " "], ArrowRight: [39, "ArrowRight"], ArrowLeft: [37, "ArrowLeft"], ArrowDown: [40, "ArrowDown"], ArrowUp: [38, "ArrowUp"] };
      result.keyLog = [];
      for (const tok of args.keys.split(",").map((t) => t.trim()).filter(Boolean)) {
        if (tok.startsWith("wait:")) { await sleep(Number(tok.slice(5)) || 500); continue; }
        let [name, times] = tok.split("*");
        times = Number(times) || 1;
        const shift = name.startsWith("Shift+");
        if (shift) name = name.slice(6);
        const [code, key] = KEYS[name] || [0, name];
        for (let n = 0; n < times; n++) {
          const base = { windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, key, code: name === "Space" ? "Space" : name, modifiers: shift ? 8 : 0 };
          await s("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
          if (key.length === 1) await s("Input.dispatchKeyEvent", { type: "char", text: key, ...base });
          await s("Input.dispatchKeyEvent", { type: "keyUp", ...base });
          await sleep(120);
          const f = await s("Runtime.evaluate", { returnByValue: true, expression: `(() => { let el = document.activeElement; let frame = '';
            if (el && el.tagName === 'IFRAME') { frame = ' (inside iframe)'; }
            const d = el ? el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') : 'none';
            const label = el ? (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('title') || '').trim().replace(/\\s+/g, ' ').slice(0, 60) : '';
            const vis = el && el.matches ? el.matches(':focus-visible') : false;
            const dlg = document.querySelector('dialog[open]') ? 'dialog open' : 'no dialog';
            return d + frame + ' | "' + label + '" | focus-visible=' + vis + ' | ' + dlg + ' | ' + location.hash; })()` });
          result.keyLog.push(`${shift ? "Shift+" : ""}${name} → ${f.result.value}`);
        }
      }
      await sleep(300);
    }
    const probe = await s("Runtime.evaluate", { returnByValue: true, expression: `(() => {
      const de = document.documentElement, b = document.body;
      const meta = (n) => { const m = document.querySelector('meta[name="'+n+'"]'); return m ? m.content : null; };
      const sw = Math.max(de.scrollWidth, b ? b.scrollWidth : 0);
      // overflow the visitor cannot scroll to (html/body clip it) is not a problem; zoom-out is still caught below
      const clipsX = [de, b].some((e) => e && /^(hidden|clip)$/.test(getComputedStyle(e).overflowX));
      let widest = null;
      if (sw > innerWidth + 1 || innerWidth > ${job.vp.w} + 1) {
        let max = ${job.vp.w};
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.right > max + 1 && getComputedStyle(el).position !== 'fixed') { max = r.right; widest = (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : '')) + ' → ' + Math.round(r.right) + 'px'; }
        }
      }
      return {
        title: document.title, lang: de.lang, h1: document.querySelectorAll('h1').length,
        robots: meta('robots'), demoId: meta('demo:id'), demoBrand: meta('demo:brand'),
        kit: !!window.DemoKit, brandNodes: document.querySelectorAll('[data-brand]').length,
        overflowX: (sw > innerWidth + 1 && !clipsX) || innerWidth > ${job.vp.w} + 1, scrollWidth: sw, innerWidth, widest,
        docHeight: Math.max(de.scrollHeight, b ? b.scrollHeight : 0),
        textChars: (b ? b.innerText : '').length,
      };
    })()` });
    Object.assign(result, probe.result.value || {});
    const front = async () => {
      await s("Page.bringToFront").catch(() => {});
      // two painted frames so the compositor has rastered the viewport (avoids repeated-tile artefacts); never wait forever
      await withTimeout(s("Runtime.evaluate", { expression: "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120))))", awaitPromise: true }), 3000, "frames").catch(() => {});
    };
    const shoot = (params) => withFront(async () => { await front(); return withTimeout(s("Page.captureScreenshot", params), 20000, "screenshot"); });
    if (!args.noShots) {
      const shotName = `${job.name}-${job.vp.w}x${job.vp.h}${args.label ? "-" + args.label : ""}${args.reduced ? "-reduced" : ""}.jpg`;
      const shot = await shoot({ format: "jpeg", quality: 78, captureBeyondViewport: !!args.full, ...(args.full ? { clip: { x: 0, y: 0, width: job.vp.w, height: Math.min(result.docHeight || job.vp.h, 12000), scale: 1 } } : {}) });
      writeFileSync(join(args.outAbs, shotName), Buffer.from(shot.data, "base64"));
      result.screenshot = join(args.out, shotName);
    }
    if (job.thumb) {
      const t = await shoot({ format: "webp", quality: 80, clip: { x: 0, y: 0, width: job.vp.w, height: job.vp.h, scale: 0.5 } });
      writeFileSync(job.thumb, Buffer.from(t.data, "base64"));
      result.thumb = job.thumb.replace(ROOT + sep, "");
    }
    if (job.isDemo && !args.noBrand && result.kit) {
      const r = await s("Runtime.evaluate", { returnByValue: true, expression: `(() => { DemoKit.setBrand(${JSON.stringify(TEST_BRAND)});
        const de = document.documentElement, b = document.body; const sw = Math.max(de.scrollWidth, b ? b.scrollWidth : 0);
        const shown = [...document.querySelectorAll('[data-brand]')].filter(e => e.textContent === ${JSON.stringify(TEST_BRAND)}).length;
        const clipped = [...document.querySelectorAll('[data-brand]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }).length;
        const clipsX = [de, b].some((e) => e && /^(hidden|clip)$/.test(getComputedStyle(e).overflowX));
        return { brandOverflowX: (sw > innerWidth + 1 && !clipsX) || innerWidth > ${job.vp.w} + 1, brandShown: shown, brandClipped: clipped }; })()` });
      Object.assign(result, r.result.value || {});
      await sleep(250);
      if (!args.noShots && job.vp.w < 600) {
        const shot = await shoot({ format: "jpeg", quality: 70 });
        const name = `${job.name}-${job.vp.w}x${job.vp.h}-brand.jpg`;
        writeFileSync(join(args.outAbs, name), Buffer.from(shot.data, "base64"));
        result.brandScreenshot = join(args.out, name);
      }
    }
  } catch (e) {
    result.errors.push("qa-tool: " + e.message);
  } finally {
    off();
    await cdp.send("Target.closeTarget", { targetId }).catch(() => {});
  }
  return result;
}

function demoFolders() {
  const dir = join(SITE, "demos");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((d) => /^\d{3}-[a-z0-9-]+$/.test(d) && existsSync(join(dir, d, "index.html"))).sort();
}

function problemsOf(r, isDemo) {
  const p = [];
  if (r.errors.length) p.push(`${r.errors.length} error(s)`);
  if (r.failed.length) p.push(`${r.failed.length} failed request(s)`);
  if (r.external.length) p.push(`external: ${[...new Set(r.external.map((u) => new URL(u).host))].join(",")}`);
  if (r.overflowX) p.push(`horizontal overflow (page ${r.scrollWidth}px, layout viewport ${r.innerWidth}px)${r.widest ? " (" + r.widest + ")" : ""}`);
  if (r.h1 !== 1) p.push(`h1 count ${r.h1}`);
  if (isDemo) {
    if (!r.kit) p.push("kit.js not loaded");
    if (!/noindex/.test(r.robots || "")) p.push("missing noindex");
    if (!r.demoId) p.push("missing demo:id");
    if (!r.demoBrand) p.push("missing demo:brand");
    if (!r.brandNodes) p.push("no [data-brand] nodes");
    if (r.brandOverflowX) p.push("overflow after brand rename");
    if (r.brandClipped) p.push(`${r.brandClipped} brand node(s) clipped after rename`);
  }
  return p;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]); return; }
  args.outAbs = resolve(ROOT, args.out);
  mkdirSync(args.outAbs, { recursive: true });

  const folders = demoFolders();
  const jobs = [];
  let selected = [];
  if (args.all) selected = folders;
  else if (args.ids) selected = folders.filter((f) => args.ids.includes(f.slice(0, 3)));
  if (args.ids && !args.all) {
    const missing = args.ids.filter((id) => !folders.some((f) => f.startsWith(id + "-")));
    if (missing.length) console.warn("No demo folder with index.html for id(s): " + missing.join(", "));
  }
  if (args.thumbs) mkdirSync(join(SITE, "assets", "thumbs"), { recursive: true });

  if (args.sheet) { await buildSheets(args, selected); return; }
  const server = await startServer();
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const f of selected) {
    for (const vp of args.viewports) {
      jobs.push({ name: f.slice(0, 3), folder: f, isDemo: true, url: `${origin}/demos/${f}/`, vp });
    }
    if (args.thumbs) jobs.push({ name: f.slice(0, 3), folder: f, isDemo: true, url: `${origin}/demos/${f}/`, vp: { w: 1440, h: 900 }, thumb: join(SITE, "assets", "thumbs", f.slice(0, 3) + ".webp"), thumbOnly: true });
  }
  for (const p of args.pages || []) {
    for (const vp of args.viewports) jobs.push({ name: p.replace(/\/index\.html$/, "").replace(/[^a-z0-9]+/gi, "_") || "home", isDemo: false, url: `${origin}/${p}`, vp });
  }
  if (!jobs.length && !args.sprite) { console.log("Nothing to check. Use --ids, --all or --pages."); server.close(); return; }

  const chrome = await launchChrome();
  const results = [];
  let i = 0;
  const started = Date.now();
  async function worker() {
    while (i < jobs.length) {
      const job = jobs[i++];
      const localArgs = job.thumbOnly ? { ...args, noShots: true, noBrand: true, eval: null, reduced: true, wait: Math.max(args.wait, 1400) } : args;
      const r = await withTimeout(checkPage(chrome.cdp, origin, job, localArgs), 120000, "job " + (job.folder || job.name) + " " + job.vp.w + "x" + job.vp.h)
        .catch((e) => ({ url: job.url, viewport: `${job.vp.w}x${job.vp.h}`, errors: ["qa-tool: " + e.message], external: [], failed: [] }));
      r.id = job.name; r.folder = job.folder; r.isDemo = job.isDemo; r.thumbOnly = !!job.thumbOnly;
      r.problems = job.thumbOnly ? r.errors.map((e) => "thumb: " + e) : problemsOf(r, job.isDemo);
      results.push(r);
      const tag = r.problems.length ? "✗" : "✓";
      if (!job.thumbOnly || r.problems.length) console.log(`${tag} ${job.folder || job.name} @${r.viewport}${job.thumbOnly ? " (thumb)" : ""}${r.problems.length ? "  → " + r.problems.join("; ") : ""}`);
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(args.concurrency, jobs.length || 1) }, worker));
    if (args.sprite) await buildSprite(chrome.cdp);
  } finally {
    chrome.close();
    server.close();
  }
  results.sort((a, b) => (a.folder || a.id).localeCompare(b.folder || b.id) || a.viewport.localeCompare(b.viewport));
  const bad = results.filter((r) => r.problems.length);
  const report = {
    tool: "tools/qa.mjs", date: new Date().toISOString(), chrome: CHROME.split("/").pop(), origin: "local static server over site/",
    viewports: args.viewports.map((v) => `${v.w}x${v.h}`), reducedMotion: !!args.reduced, eval: args.eval || null,
    checked: results.length, withProblems: bad.length, seconds: Math.round((Date.now() - started) / 1000), results,
  };
  const ids = args.ids || [];
  const scope = args.all ? "all" : args.pages ? "pages" : ids.length > 6 ? `${ids[0]}-${ids[ids.length - 1]}-${ids.length}ids` : (ids.join("_") || "run");
  const reportName = `report-${scope}${args.label ? "-" + args.label : ""}.json`;
  writeFileSync(join(args.outAbs, reportName), JSON.stringify(report, null, 2));
  console.log(`\n${results.length} checks, ${bad.length} with problems, ${report.seconds}s. Report: ${join(args.out, reportName)}`);
  if (bad.length) process.exitCode = 2;
}

/* Contact sheets of existing screenshots, for fast human review: 6 desktop shots or 8 phone shots per image. */
async function buildSheets(args, selected) {
  const dir = args.sheet.replace(/\/$/, "");
  const ids = selected.map((f) => f.slice(0, 3));
  const kinds = args.dense
    ? [{ suffix: "1440x900", per: 12, cols: 4, w: 480, h: 300 }, { suffix: "390x844", per: 16, cols: 8, w: 195, h: 422 }]
    : [{ suffix: "1440x900", per: 6, cols: 3, w: 720, h: 450 }, { suffix: "390x844", per: 8, cols: 8, w: 195, h: 422 }];
  const chrome = await launchChrome();
  const server = await startServer();
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const k of kinds) {
      for (let i = 0; i < ids.length; i += k.per) {
        const chunk = ids.slice(i, i + k.per).filter((id) => existsSync(join(ROOT, dir, `${id}-${k.suffix}.jpg`)));
        if (!chunk.length) continue;
        const rows = Math.ceil(chunk.length / k.cols);
        const W = k.cols * (k.w + 16) + 16, H = rows * (k.h + 44) + 16;
        const cells = chunk.map((id) => `<figure><figcaption>${id} · ${selected.find((f) => f.startsWith(id))}</figcaption><img src="/__root/${dir}/${id}-${k.suffix}.jpg"></figure>`).join("");
        const html = `<!doctype html><style>body{margin:0;padding:8px;background:#222;font:600 14px system-ui;color:#fff;display:grid;grid-template-columns:repeat(${k.cols},${k.w}px);gap:0 16px;width:${W}px}figure{margin:0 0 8px}figcaption{height:28px;line-height:28px;overflow:hidden;white-space:nowrap}img{width:${k.w}px;height:${k.h}px;object-fit:cover;object-position:top;display:block;background:#444}</style>${cells}`;
        const name = `__sheet.html`;
        const srv = await startServer({ ["/" + name]: html });
        const o2 = `http://127.0.0.1:${srv.address().port}`;
        const { targetId } = await chrome.cdp.send("Target.createTarget", { url: "about:blank" });
        const { sessionId } = await chrome.cdp.send("Target.attachToTarget", { targetId, flatten: true });
        const s = (m, p) => chrome.cdp.send(m, p, sessionId);
        await s("Page.enable");
        await s("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
        await s("Page.navigate", { url: `${o2}/${name}` });
        await sleep(1500);
        const shot = await s("Page.captureScreenshot", { format: "jpeg", quality: 72, clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
        const out = join(args.outAbs, `sheet-${k.suffix}-${chunk[0]}-${chunk[chunk.length - 1]}.jpg`);
        writeFileSync(out, Buffer.from(shot.data, "base64"));
        console.log(out.replace(ROOT + sep, ""));
        await chrome.cdp.send("Target.closeTarget", { targetId }).catch(() => {});
        srv.close();
      }
    }
  } finally { chrome.close(); server.close(); }
}

/* The hero "box" uses one sprite: 12 x 9 tiles of 160x100 (in id order) built from the thumbnails. */
async function buildSprite(cdp) {
  const folders = demoFolders();
  const cols = 12, tw = 160, th = 100, rows = Math.ceil(folders.length / cols);
  const cells = folders.map((f, i) => `<img src="/assets/thumbs/${f.slice(0, 3)}.webp" style="left:${(i % cols) * tw}px;top:${Math.floor(i / cols) * th}px">`).join("");
  const html = `<!doctype html><html><head><style>html,body{margin:0;background:#e9e3d6}img{position:absolute;width:${tw}px;height:${th}px;object-fit:cover;object-position:top}</style></head><body>${cells}</body></html>`;
  const server = await startServer({ "/__sprite.html": html });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => cdp.send(m, p, sessionId);
  await s("Page.enable");
  await s("Emulation.setDeviceMetricsOverride", { width: cols * tw, height: rows * th, deviceScaleFactor: 1, mobile: false });
  await s("Page.navigate", { url: origin + "/__sprite.html" });
  await sleep(2500);
  const shot = await s("Page.captureScreenshot", { format: "webp", quality: 72, clip: { x: 0, y: 0, width: cols * tw, height: rows * th, scale: 1 } });
  const out = join(SITE, "assets", "box-sprite.webp");
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  writeFileSync(join(SITE, "assets", "box-sprite.json"), JSON.stringify({ cols, rows, tile: [tw, th], order: folders.map((f) => f.slice(0, 3)) }, null, 2));
  await cdp.send("Target.closeTarget", { targetId }).catch(() => {});
  server.close();
  console.log(`sprite: site/assets/box-sprite.webp (${cols}x${rows} tiles, ${folders.length} demos)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
