/**
 * Live Dashboard Reporter
 *
 * A custom Playwright reporter that streams test execution to a live
 * browser dashboard (progress, pass/fail counts, per-spec status) and
 * classifies every failure so it can be triaged at a glance.
 *
 * Usage:   npm run test:dashboard
 *          (= playwright test --reporter=list,./tests/reporters/live-dashboard/reporter.ts)
 *
 * While the run is going:   http://localhost:9400  (opens automatically)
 * After the run:            live-dashboard-report/index.html  (static copy, shareable)
 *
 * Env options:
 *   LIVE_DASHBOARD_PORT=9400     change the port
 *   LIVE_DASHBOARD_OPEN=0        don't auto-open the browser
 *   LIVE_DASHBOARD_EXIT=1        don't keep the server running after the run
 *   CI=true                      implies OPEN=0 and EXIT=1
 *
 * Failure categories (final outcome of each test, after retries):
 *   passed         – passed first time
 *   flaky          – failed, then passed on retry            (reported by Playwright, reliable)
 *   known-bug      – tagged with a "known-bug" annotation    (set by the QA engineer, reliable)
 *   likely-app-bug – an expect() assertion failed            (heuristic: the app returned the wrong thing)
 *   likely-test-env– timeout / locator / network / browser   (heuristic: test or environment problem)
 *   needs-triage   – failed for a reason that fits neither   (heuristic)
 *   skipped
 */
import type {
    FullConfig, FullResult, Reporter, Suite, TestCase, TestResult, TestStep,
} from '@playwright/test/reporter';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

type Category = 'passed' | 'flaky' | 'known-bug' | 'likely-app-bug' | 'likely-test-env' | 'needs-triage' | 'skipped';

interface Attempt {
    retry: number;
    status: string;
    duration: number;
    error?: string;
    location?: string;
    snippet?: string;
    steps: { title: string; duration: number; error?: boolean }[];
    attachments: { name: string; contentType: string; url: string; file: string }[];
}

interface TestState {
    id: string;
    title: string;
    fullTitle: string;
    spec: string;
    file: string;
    line: number;
    describe: string;
    status: 'queued' | 'running' | 'retrying' | 'done';
    category?: Category;
    reason?: string;
    knownBug?: string;
    expectedToFail?: boolean;
    duration: number;
    attempts: Attempt[];
    startedAt?: number;
    finishedAt?: number;
}

const ANSI = /\u001b\[[0-9;]*m/g;
const strip = (s?: string) => (s || '').replace(ANSI, '');

class LiveDashboardReporter implements Reporter {
    private port = Number(process.env.LIVE_DASHBOARD_PORT || 9400);
    private isCI = !!process.env.CI;
    private autoOpen = process.env.LIVE_DASHBOARD_OPEN !== '0' && !this.isCI;
    private keepOpen = process.env.LIVE_DASHBOARD_EXIT !== '1' && !this.isCI;

    private rootDir = process.cwd();
    private artifactDirs: string[] = [];
    private uiDir = __dirname;
    private outDir = path.join(process.cwd(), 'live-dashboard-report');
    private server?: http.Server;
    private clients = new Set<http.ServerResponse>();

    private tests = new Map<string, TestState>();
    private order: string[] = [];
    private run = {
        project: 'FinCore Bank',
        status: 'running' as 'running' | 'passed' | 'failed' | 'interrupted' | 'timedout',
        startedAt: Date.now(),
        finishedAt: 0,
        total: 0,
        workers: 1,
        retries: 0,
        running: [] as string[],
    };

    // ── Lifecycle ──────────────────────────────────────────────

    onBegin(config: FullConfig, suite: Suite) {
        // Project root = folder of playwright.config.ts (config.rootDir is the testDir)
        this.rootDir = config.configFile ? path.dirname(config.configFile) : process.cwd();
        this.outDir = path.join(this.rootDir, 'live-dashboard-report');
        this.artifactDirs = config.projects.map(p => path.resolve(p.outputDir));
        this.run.workers = config.workers;
        this.run.retries = config.projects.reduce((m, p) => Math.max(m, p.retries), 0);
        for (const test of suite.allTests()) {
            const file = path.relative(this.rootDir, test.location.file).replace(/\\/g, '/');
            const titlePath = test.titlePath().filter(Boolean);       // ['', project, file, describe..., title]
            const describe = titlePath.slice(3, -1).join(' › ');
            const kb = test.annotations.find(a => a.type === 'known-bug');
            const st: TestState = {
                id: test.id,
                title: test.title,
                fullTitle: titlePath.slice(2).join(' › '),
                spec: path.basename(file).replace(/\.spec\.ts$/, ''),
                file,
                line: test.location.line,
                describe,
                status: 'queued',
                knownBug: kb?.description,
                expectedToFail: test.expectedStatus === 'failed',
                duration: 0,
                attempts: [],
            };
            this.tests.set(test.id, st);
            this.order.push(test.id);
        }
        this.run.total = this.order.length;
        this.startServer();
        this.broadcast('snapshot', this.snapshot());
    }

    onTestBegin(test: TestCase, result: TestResult) {
        const st = this.tests.get(test.id);
        if (!st) return;
        st.status = result.retry > 0 ? 'retrying' : 'running';
        st.startedAt = st.startedAt || Date.now();
        if (!this.run.running.includes(test.id)) this.run.running.push(test.id);
        this.broadcast('test', { test: st, run: this.runInfo() });
    }

    onTestEnd(test: TestCase, result: TestResult) {
        const st = this.tests.get(test.id);
        if (!st) return;
        st.expectedToFail = test.expectedStatus === 'failed';    // test.fail() can also be called at runtime
        st.attempts.push(this.toAttempt(result));
        st.duration += result.duration;

        const willRetry = result.status !== 'passed' && result.status !== 'skipped'
            && result.status !== test.expectedStatus && result.retry < test.retries;

        if (willRetry) {
            st.status = 'retrying';
        } else {
            st.status = 'done';
            st.finishedAt = Date.now();
            const { category, reason } = this.classify(test, st);
            st.category = category;
            st.reason = reason;
            this.run.running = this.run.running.filter(id => id !== test.id);
        }
        this.broadcast('test', { test: st, run: this.runInfo() });
    }

    async onEnd(result: FullResult) {
        this.run.finishedAt = Date.now();
        this.run.running = [];
        const done = [...this.tests.values()];
        const hardFail = done.some(t => ['likely-app-bug', 'likely-test-env', 'needs-triage'].includes(t.category || ''));
        this.run.status = result.status === 'interrupted' ? 'interrupted'
            : result.status === 'timedout' ? 'timedout'
            : hardFail ? 'failed' : 'passed';
        this.broadcast('end', this.snapshot());
        this.writeStaticReport();
        const rel = path.relative(process.cwd(), path.join(this.outDir, 'index.html'));
        process.stdout.write(`\n📊 Live dashboard report saved: ${rel}\n`);
    }

    async onExit() {
        if (!this.server) return;
        if (this.keepOpen) {
            process.stdout.write(`📡 Dashboard still running at http://localhost:${this.port}  —  press Ctrl+C to quit.\n`);
            await new Promise<void>(() => { /* keep serving until Ctrl+C */ });
        }
        for (const c of this.clients) c.end();
        await new Promise<void>(r => this.server!.close(() => r()));
    }

    printsToStdio() { return false; }

    // ── Classification ─────────────────────────────────────────

    private classify(test: TestCase, st: TestState): { category: Category; reason: string } {
        const outcome = test.outcome();          // 'expected' | 'unexpected' | 'flaky' | 'skipped'
        const last = st.attempts[st.attempts.length - 1];

        if (outcome === 'skipped') return { category: 'skipped', reason: 'Test was skipped.' };

        if (st.knownBug && st.expectedToFail && outcome === 'expected')
            return { category: 'known-bug', reason: `Fails as expected: ${st.knownBug}. Test is marked test.fail() until the bug is fixed.` };

        if (outcome === 'expected') return { category: 'passed', reason: 'Passed.' };

        if (outcome === 'flaky')
            return { category: 'flaky', reason: `Failed on attempt 1, passed on retry ${st.attempts.length - 1}. Behaviour is not deterministic: check waits, test data and shared state.` };

        if (st.knownBug)
            return { category: 'known-bug', reason: st.expectedToFail
                ? `Known bug ${st.knownBug} — test is marked as expected to fail but PASSED. The bug may be fixed: remove test.fail().`
                : `Failure linked to ${st.knownBug}.` };

        const msg = strip(last?.error);
        if (/expect\(|toHave|toBe|toContain|toEqual|toMatch/i.test(msg) && !/^Error: (locator|page)\.\w+: Test timeout/m.test(msg))
            return { category: 'likely-app-bug', reason: 'An assertion failed: the app returned or displayed something different from what the test expects. Confirm against the requirement before raising a defect.' };

        if (/timeout|waiting for|locator\.|net::ERR|ECONNREFUSED|ECONNRESET|Target (page|context|browser).*closed|browserType\.launch|intercepts pointer events|not visible|not enabled|detached/i.test(msg))
            return { category: 'likely-test-env', reason: 'Timed out or could not interact with an element (no assertion failed). Usually a wait, locator, overlay or test-data issue — or the environment was slow/unavailable.' };

        return { category: 'needs-triage', reason: 'Failed for a reason that doesn\'t match a known pattern. Needs a human look.' };
    }

    // ── Helpers ────────────────────────────────────────────────

    private toAttempt(r: TestResult): Attempt {
        const err = r.errors?.length ? r.errors : (r.error ? [r.error] : []);
        const primary = err[err.length - 1] || err[0];
        const flatten = (steps: TestStep[], depth = 0, out: Attempt['steps'] = []) => {
            for (const s of steps) {
                if (s.category === 'test.step' || s.category === 'pw:api' || s.category === 'expect') {
                    out.push({ title: '  '.repeat(depth) + s.title, duration: s.duration, error: !!s.error });
                }
                if (depth < 2) flatten(s.steps, depth + 1, out);
            }
            return out;
        };
        return {
            retry: r.retry,
            status: r.status,
            duration: r.duration,
            error: strip(err.map(e => e.message || e.value || '').join('\n\n')).slice(0, 6000) || undefined,
            location: primary?.location ? `${path.relative(this.rootDir, primary.location.file).replace(/\\/g, '/')}:${primary.location.line}` : undefined,
            snippet: strip(primary?.snippet) || undefined,
            steps: flatten(r.steps).slice(-40),
            attachments: (r.attachments || [])
                .filter(a => a.path && fs.existsSync(a.path))
                .map(a => ({
                    name: a.name,
                    contentType: a.contentType,
                    file: a.path!,
                    url: '/artifact?f=' + encodeURIComponent(path.relative(this.rootDir, a.path!)),
                })),
        };
    }

    private runInfo() {
        const done = [...this.tests.values()].filter(t => t.status === 'done');
        return { ...this.run, completed: done.length, now: Date.now() };
    }

    private snapshot() {
        return { run: this.runInfo(), tests: this.order.map(id => this.tests.get(id)) };
    }

    private broadcast(event: string, data: unknown) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        for (const c of this.clients) c.write(payload);
    }

    // ── HTTP server (dashboard + live events + artifacts) ──────

    private startServer() {
        this.server = http.createServer((req, res) => {
            const url = new URL(req.url || '/', 'http://localhost');
            if (url.pathname === '/events') {
                res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
                res.write(`event: snapshot\ndata: ${JSON.stringify(this.snapshot())}\n\n`);
                this.clients.add(res);
                req.on('close', () => this.clients.delete(res));
                return;
            }
            if (url.pathname === '/state.js') return this.send(res, 200, 'text/javascript', 'window.__STATIC_STATE__ = null;');
            if (url.pathname === '/state') return this.send(res, 200, 'application/json', JSON.stringify(this.snapshot()));
            if (url.pathname === '/artifact') {
                const rel = url.searchParams.get('f') || '';
                const abs = path.resolve(this.rootDir, rel);
                const allowed = this.artifactDirs.some(d => abs.startsWith(d + path.sep));
                if (!allowed || !fs.existsSync(abs)) return this.send(res, 404, 'text/plain', 'Not found');
                const download = /\.zip$/.test(abs) ? { 'Content-Disposition': `attachment; filename="${path.basename(abs)}"` } : {};
                res.writeHead(200, { 'Content-Type': mime(abs), ...download });
                fs.createReadStream(abs).pipe(res);
                return;
            }
            const page = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
            if (['index.html', 'detail.html', 'dashboard.css', 'dashboard.js'].includes(page))
                return this.send(res, 200, mime(page), fs.readFileSync(path.join(this.uiDir, 'ui', page)));
            this.send(res, 404, 'text/plain', 'Not found');
        });
        this.server.on('error', (e: NodeJS.ErrnoException) => {
            process.stdout.write(`⚠️  Live dashboard could not start on port ${this.port} (${e.code}). Tests will still run.\n`);
            this.server = undefined;
        });
        this.server.listen(this.port, () => {
            const url = `http://localhost:${this.port}`;
            process.stdout.write(`\n📊 Live test dashboard: ${url}\n\n`);
            if (this.autoOpen) openBrowser(url);
        });
    }

    private send(res: http.ServerResponse, code: number, type: string, body: string | Buffer) {
        res.writeHead(code, { 'Content-Type': type });
        res.end(body);
    }

    // ── Static, shareable copy of the final dashboard ──────────

    private writeStaticReport() {
        try {
            fs.rmSync(this.outDir, { recursive: true, force: true });
            fs.mkdirSync(path.join(this.outDir, 'artifacts'), { recursive: true });
            const snap = JSON.parse(JSON.stringify(this.snapshot()));   // copy — don't touch live state
            let n = 0;
            for (const t of snap.tests) for (const a of t.attempts) for (const att of a.attachments) {
                const name = `${++n}-${path.basename(att.file)}`;
                fs.copyFileSync(att.file, path.join(this.outDir, 'artifacts', name));
                att.url = 'artifacts/' + name;
            }
            for (const t of snap.tests) for (const a of t.attempts) for (const att of a.attachments) delete att.file;
            fs.writeFileSync(path.join(this.outDir, 'state.js'), 'window.__STATIC_STATE__ = ' + JSON.stringify(snap) + ';');
            for (const f of ['index.html', 'detail.html', 'dashboard.css', 'dashboard.js'])
                fs.copyFileSync(path.join(this.uiDir, 'ui', f), path.join(this.outDir, f));
        } catch (e) {
            process.stdout.write(`⚠️  Could not write static dashboard report: ${(e as Error).message}\n`);
        }
    }
}

function mime(f: string) {
    const ext = path.extname(f).toLowerCase();
    return ({
        '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webm': 'video/webm', '.zip': 'application/zip',
        '.txt': 'text/plain', '.md': 'text/markdown',
    } as Record<string, string>)[ext] || 'application/octet-stream';
}

function openBrowser(url: string) {
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => { /* ignore — user can open the URL manually */ });
}

export default LiveDashboardReporter;
