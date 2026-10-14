#!/usr/bin/env node
/**
 * Live Dashboard server
 *
 * Two ways it's used:
 *  1. In-process by reporter.ts  (npm run test:dashboard)  — dashboard lives inside one test run.
 *  2. Standalone                 (npm run dashboard)       — a permanent dashboard that starts,
 *     re-runs and stops test runs itself. Each run's reporter streams events back to it.
 *
 *     npm run dashboard                 open the dashboard and start a full run
 *     npm run dashboard -- --no-run     open the dashboard without starting a run
 *     npm run dashboard -- --port 9500  use another port
 *
 * Plain Node, no dependencies. Listens on 127.0.0.1 only.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

const UI_DIR = path.join(__dirname, 'ui');
const UI_FILES = ['index.html', 'detail.html', 'dashboard.css', 'dashboard.js'];
const HISTORY_DIR = 'live-dashboard-history';
const REPORT_DIR = 'live-dashboard-report';
const HISTORY_KEEP = 20;
const FAILISH = ['likely-app-bug', 'likely-test-env', 'needs-triage'];
const BROWSERS = ['chromium', 'firefox', 'webkit'];

// ── History (written by the reporter at the end of every run) ──────────────
function writeHistory(root, snapshot, options) {
    const dir = path.join(root, HISTORY_DIR);
    fs.mkdirSync(dir, { recursive: true });
    const run = snapshot.run;
    const counts = {};
    const results = {};
    for (const t of snapshot.tests) {
        if (t.status !== 'done' || !t.category) continue;
        counts[t.category] = (counts[t.category] || 0) + 1;
        results[t.id] = [t.category, t.duration, t.attempts.length];
    }
    const id = new Date(run.startedAt).toISOString().replace(/[:.]/g, '-');
    const entry = {
        id, startedAt: run.startedAt, finishedAt: run.finishedAt, status: run.status,
        total: snapshot.tests.length, counts, options: options || null, results,
    };
    fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify(entry));
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - HISTORY_KEEP))) fs.rmSync(path.join(dir, f), { force: true });
}

function readHistory(root) {
    const dir = path.join(root, HISTORY_DIR);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().slice(-HISTORY_KEEP).map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; }
    }).filter(Boolean);
}

// ── Dashboard server ───────────────────────────────────────────────────────
function createDashboard({ root, port = 9400, controller = null, log = s => process.stdout.write(s) }) {
    let state = { run: null, tests: [] };
    let history = readHistory(root);
    const clients = new Set();
    const artifactDirs = [path.resolve(root, 'test-results'), path.resolve(root, REPORT_DIR, 'artifacts')];

    function emitToBrowsers(event, data) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        for (const c of clients) c.write(payload);
    }

    // Apply an event from a test run and fan it out to every open browser tab
    function ingest(event, data) {
        if (event === 'snapshot' || event === 'end') state = data;
        else if (event === 'test') {
            const i = state.tests.findIndex(t => t.id === data.test.id);
            if (i >= 0) state.tests[i] = data.test; else state.tests.push(data.test);
            state.run = data.run;
        }
        emitToBrowsers(event, data);
        if (event === 'end') {
            history = readHistory(root);
            emitToBrowsers('history', history);
        }
        if (controller && (event === 'snapshot' || event === 'end')) emitToBrowsers('control', controller.info());
    }

    function setState(s) { state = s; }
    function getState() { return state; }

    function send(res, code, type, body) { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); }
    function readBody(req) {
        return new Promise((resolve) => {
            let b = ''; req.on('data', c => { b += c; if (b.length > 5e6) req.destroy(); });
            req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
        });
    }

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', 'http://localhost');
        const p = url.pathname;

        if (p === '/events') {
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
            res.write(`event: snapshot\ndata: ${JSON.stringify(state)}\n\n`);
            res.write(`event: history\ndata: ${JSON.stringify(history)}\n\n`);
            res.write(`event: control\ndata: ${JSON.stringify(controller ? controller.info() : { enabled: false })}\n\n`);
            clients.add(res);
            const ping = setInterval(() => res.write(': ping\n\n'), 20000);
            req.on('close', () => { clients.delete(res); clearInterval(ping); });
            return;
        }
        if (p === '/state.js') return send(res, 200, 'text/javascript', 'window.__STATIC_STATE__ = null;');
        if (p === '/state') return send(res, 200, 'application/json', JSON.stringify(state));
        if (p === '/history') return send(res, 200, 'application/json', JSON.stringify(history));

        if (p === '/artifact' || p.startsWith('/artifacts/')) {
            const abs = p === '/artifact'
                ? path.resolve(root, url.searchParams.get('f') || '')
                : path.resolve(root, REPORT_DIR, decodeURIComponent(p.slice(1)));
            const allowed = artifactDirs.some(d => abs.startsWith(d + path.sep));
            if (!allowed || !fs.existsSync(abs)) return send(res, 404, 'text/plain', 'Not found');
            const extra = /\.zip$/.test(abs) ? { 'Content-Disposition': `attachment; filename="${path.basename(abs)}"` } : {};
            res.writeHead(200, { 'Content-Type': mime(abs), ...extra });
            fs.createReadStream(abs).pipe(res);
            return;
        }

        if (req.method === 'POST' && p === '/ingest') {
            if (!controller) return send(res, 404, 'text/plain', 'Not found');
            const { event, data } = await readBody(req);
            if (['snapshot', 'test', 'end'].includes(event)) ingest(event, data);
            return send(res, 204, 'text/plain', '');
        }
        if (req.method === 'POST' && p === '/api/run') {
            if (!controller) return send(res, 404, 'application/json', '{"error":"Run controls need: npm run dashboard"}');
            const r = controller.start(await readBody(req));
            return send(res, r.error ? 400 : 200, 'application/json', JSON.stringify(r));
        }
        if (req.method === 'POST' && p === '/api/stop') {
            if (!controller) return send(res, 404, 'application/json', '{}');
            return send(res, 200, 'application/json', JSON.stringify(controller.stop()));
        }

        const page = p === '/' ? 'index.html' : p.replace(/^\//, '');
        if (UI_FILES.includes(page)) return send(res, 200, mime(page), fs.readFileSync(path.join(UI_DIR, page)));
        send(res, 404, 'text/plain', 'Not found');
    });

    function listen(tryNext = 0) {
        const base = port;
        return new Promise((resolve, reject) => {
            let n = 0;
            const onError = (e) => {
                if (e.code === 'EADDRINUSE' && n < tryNext) { n++; server.listen(base + n, '127.0.0.1'); }
                else { server.off('listening', onListening); reject(e); }
            };
            const onListening = () => { server.off('error', onError); port = server.address().port; resolve(port); };
            server.on('error', onError);
            server.once('listening', onListening);
            server.listen(base, '127.0.0.1');
        });
    }

    function close() {
        for (const c of clients) c.end();
        return new Promise(r => server.close(() => r()));
    }

    return { ingest, listen, close, setState, getState, emitToBrowsers, get port() { return port; } };
}

// ── Run controller (standalone mode only) ─────────────────────────────────
function createController(root, getPort, onLog) {
    let child = null;
    let current = null;          // options of the run in progress
    let catalog = [];            // every test in the suite: { file, line, title, describe, spec }
    let dash = null;

    const cli = resolvePlaywrightCli(root);
    const reporterPath = './' + path.relative(root, path.join(__dirname, 'reporter.ts')).replace(/\\/g, '/');

    function browsersInstalled() {
        const out = { chromium: true, firefox: false, webkit: false };
        try {
            const pw = require(require.resolve('playwright-core', { paths: [root] }));
            for (const b of ['firefox', 'webkit']) {
                try { out[b] = fs.existsSync(pw[b].executablePath()); } catch { out[b] = false; }
            }
        } catch { /* leave defaults */ }
        return out;
    }

    function lastFailed() {
        const s = dash ? dash.getState() : null;
        if (!s) return [];
        return s.tests.filter(t => t.status === 'done' && (FAILISH.includes(t.category) || t.category === 'flaky'))
            .map(t => ({ file: t.file, line: t.line, title: t.title, project: t.project }));
    }

    function info() {
        return {
            enabled: true,
            running: !!child,
            options: current,
            browsers: browsersInstalled(),
            failed: lastFailed(),
            catalog,
        };
    }

    function loadCatalog() {
        if (!cli) return;
        const p = spawn(process.execPath, [cli, 'test', '--list', '--reporter=json'], { cwd: root, env: { ...process.env, FORCE_COLOR: '0' } });
        let out = '';
        p.stdout.on('data', d => { out += d; });
        p.on('close', () => {
            try {
                const json = JSON.parse(out.slice(out.indexOf('{')));
                const testDir = json.config.rootDir;
                const list = [];
                const walk = (s, chain) => {
                    for (const sp of s.specs || []) {
                        const file = path.relative(root, path.join(testDir, sp.file)).replace(/\\/g, '/');
                        if (sp.tests.some(t => t.projectName === 'chromium'))
                            list.push({ file, line: sp.line, title: sp.title, describe: chain.join(' › '), spec: path.basename(file).replace(/\.spec\.ts$/, '') });
                    }
                    for (const c of s.suites || []) walk(c, [...chain, c.title]);
                };
                for (const s of json.suites) walk(s, []);
                catalog = list;
                if (dash) dash.emitToBrowsers('control', info());
            } catch (e) { onLog(`⚠️  Could not list tests: ${e.message}\n`); }
        });
    }

    function start(opts = {}) {
        if (child) return { error: 'A run is already in progress. Stop it first.' };
        if (!cli) return { error: 'Could not find @playwright/test. Run npm install.' };
        const scope = ['all', 'failed', 'spec', 'test'].includes(opts.scope) ? opts.scope : 'all';
        const browsers = (Array.isArray(opts.browsers) ? opts.browsers : ['chromium']).filter(b => BROWSERS.includes(b));
        if (!browsers.length) return { error: 'Pick at least one browser.' };
        const installed = browsersInstalled();
        const missing = browsers.filter(b => !installed[b]);
        if (missing.length) return { error: `${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not installed. Run: npx playwright install ${missing.join(' ')}` };

        const files = new Set(catalog.map(t => t.file));
        let selection = [];
        let label = 'All tests';
        if (scope === 'failed') {
            const f = lastFailed();
            if (!f.length) return { error: 'There are no failed or flaky tests in the last run.' };
            selection = [...new Set(f.map(t => `${t.file}:${t.line}`))];
            label = `Failed only (${f.length})`;
        } else if (scope === 'spec') {
            if (!files.has(opts.file)) return { error: 'Unknown spec file.' };
            selection = [opts.file];
            label = path.basename(opts.file);
        } else if (scope === 'test') {
            const t = catalog.find(c => c.file === opts.file && c.line === Number(opts.line));
            if (!t) return { error: 'Unknown test.' };
            selection = [`${t.file}:${t.line}`];
            label = t.title;
        }

        const args = [cli, 'test', ...selection, ...browsers.map(b => `--project=${b}`), `--reporter=list,${reporterPath}`];
        if (opts.headed) args.push('--headed');
        current = { scope, label, browsers, headed: !!opts.headed, startedAt: Date.now() };

        onLog(`\n▶  Starting run: ${label} · ${browsers.join(', ')}${opts.headed ? ' · headed' : ''}\n`);
        child = spawn(process.execPath, args, {
            cwd: root,
            detached: process.platform !== 'win32',
            env: {
                ...process.env,
                LIVE_DASHBOARD_SERVER: `http://127.0.0.1:${getPort()}`,
                LIVE_DASHBOARD_RUN_OPTS: JSON.stringify(current),
                FINCORE_BROWSERS: browsers.join(','),
            },
        });
        child.stdout.on('data', d => onLog(String(d)));
        child.stderr.on('data', d => onLog(String(d)));
        const me = child;
        child.on('close', (code) => {
            if (child !== me) return;
            child = null;
            const s = dash.getState();
            if (s.run && s.run.status === 'running') {          // stopped or crashed before the reporter's 'end'
                s.run.status = 'interrupted'; s.run.finishedAt = Date.now(); s.run.running = [];
                for (const t of s.tests) if (t.status !== 'done') t.status = 'queued';
                dash.ingest('end', s);
            }
            onLog(`■  Run finished (exit code ${code ?? 'stopped'}).\n`);
            dash.emitToBrowsers('control', info());
            loadCatalog();                                   // pick up specs/tests added since the dashboard started
        });
        dash.emitToBrowsers('control', info());
        return { ok: true, options: current };
    }

    function stop() {
        if (!child) return { ok: true };
        const pid = child.pid;
        onLog('\n⏹  Stopping run…\n');
        if (process.platform === 'win32') exec(`taskkill /pid ${pid} /T /F`, () => {});
        else { try { process.kill(-pid, 'SIGINT'); } catch { try { child.kill('SIGINT'); } catch { /* gone */ } } }
        setTimeout(() => { if (child && child.pid === pid) { try { process.platform === 'win32' ? exec(`taskkill /pid ${pid} /T /F`) : process.kill(-pid, 'SIGKILL'); } catch { /* gone */ } } }, 8000);
        return { ok: true };
    }

    return { info, start, stop, loadCatalog, attach(d) { dash = d; }, get running() { return !!child; } };
}

function resolvePlaywrightCli(root) {
    try { return require.resolve('@playwright/test/cli', { paths: [root] }); } catch { return null; }
}

function loadLastReport(root) {
    const f = path.join(root, REPORT_DIR, 'state.js');
    if (!fs.existsSync(f)) return null;
    try {
        const s = fs.readFileSync(f, 'utf8');
        const snap = JSON.parse(s.slice(s.indexOf('=') + 1).trim().replace(/;$/, ''));
        delete snap.history;
        return snap;
    } catch { return null; }
}

function mime(f) {
    const ext = path.extname(f).toLowerCase();
    return ({
        '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webm': 'video/webm', '.zip': 'application/zip',
        '.txt': 'text/plain', '.md': 'text/markdown',
    })[ext] || 'application/octet-stream';
}

function openBrowser(url) {
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => { /* user can open the URL manually */ });
}

// ── CLI: npm run dashboard ─────────────────────────────────────────────────
async function main() {
    const argv = process.argv.slice(2);
    const noRun = argv.includes('--no-run');
    const pi = argv.indexOf('--port');
    const port = Number(pi >= 0 ? argv[pi + 1] : process.env.LIVE_DASHBOARD_PORT || 9400);
    const root = findRoot(process.cwd()) || findRoot(__dirname) || process.cwd();
    const log = s => process.stdout.write(s);

    let dash;
    const controller = createController(root, () => dash.port, log);
    dash = createDashboard({ root, port, controller, log });
    controller.attach(dash);

    try {
        await dash.listen(0);
    } catch (e) {
        if (e.code === 'EADDRINUSE') {
            log(`\nℹ️  A dashboard is already running at http://localhost:${port} — opening it.\n`);
            if (process.env.LIVE_DASHBOARD_OPEN !== '0') openBrowser(`http://localhost:${port}`);
            process.exit(0);
        }
        throw e;
    }

    const last = loadLastReport(root);
    if (last) dash.setState(last);
    controller.loadCatalog();

    const url = `http://localhost:${dash.port}`;
    log(`\n📊 FinCore test dashboard: ${url}\n   ${noRun ? 'Waiting — start a run from the dashboard.' : 'Starting a full run…'}\n   Press Ctrl+C to quit.\n`);
    if (process.env.LIVE_DASHBOARD_OPEN !== '0' && !process.env.CI) openBrowser(url);
    if (!noRun) controller.start({ scope: 'all', browsers: ['chromium'] });

    const quit = () => { controller.stop(); setTimeout(() => process.exit(0), 300); };
    process.on('SIGINT', quit);
    process.on('SIGTERM', quit);
}

function findRoot(dir) {
    let d = path.resolve(dir);
    for (let i = 0; i < 6; i++) {
        if (fs.existsSync(path.join(d, 'playwright.config.ts')) || fs.existsSync(path.join(d, 'playwright.config.js'))) return d;
        const up = path.dirname(d); if (up === d) break; d = up;
    }
    return null;
}

module.exports = { createDashboard, writeHistory, readHistory, HISTORY_DIR, REPORT_DIR };

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
