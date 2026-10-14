/**
 * Live Dashboard Reporter
 *
 * A custom Playwright reporter that streams test execution to a live
 * browser dashboard (progress, pass/fail counts, per-spec status) and
 * classifies every failure so it can be triaged at a glance.
 *
 * Two modes:
 *   npm run dashboard        permanent dashboard (server.js) that starts / re-runs / stops runs;
 *                            each run's reporter streams to it (LIVE_DASHBOARD_SERVER is set)
 *   npm run test:dashboard   one run; the reporter hosts the dashboard itself
 *
 * Every run also writes:
 *   live-dashboard-report/index.html   static, shareable copy of the final dashboard
 *   live-dashboard-history/*.json      one summary per run (last 20) for the run-history views
 *
 * Env options (test:dashboard mode):
 *   LIVE_DASHBOARD_PORT=9400     port (tries the next few if busy)
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
// eslint-disable-next-line @typescript-eslint/no-var-requires
const dashboardServer = require('./server.js');

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
    project: string;
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
    private serverUrl = process.env.LIVE_DASHBOARD_SERVER || '';      // set when launched by `npm run dashboard`
    private runOptions = safeJson(process.env.LIVE_DASHBOARD_RUN_OPTS);
    private dash: any = null;                                         // in-process dashboard (test:dashboard mode)
    private queue: Promise<void> = Promise.resolve();

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
            const titlePath = test.titlePath().filter(Boolean);       // [project, file, describe..., title]
            const describe = titlePath.slice(2, -1).join(' › ');
            const kb = test.annotations.find(a => a.type === 'known-bug');
            const st: TestState = {
                id: test.id,
                title: test.title,
                fullTitle: titlePath.slice(2).join(' › '),
                project: titlePath[0] || '',
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
        if (!this.serverUrl) this.startServer();
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
        try { dashboardServer.writeHistory(this.rootDir, this.snapshot(), this.runOptions); }
        catch (e) { process.stdout.write(`⚠️  Could not save run history: ${(e as Error).message}\n`); }
        this.writeStaticReport();
        this.broadcast('end', this.snapshot());
        await this.queue;
        const rel = path.relative(process.cwd(), path.join(this.outDir, 'index.html'));
        process.stdout.write(`\n📊 Live dashboard report saved: ${rel}\n`);
    }

    async onExit() {
        await this.queue;
        if (!this.dash) return;
        if (this.keepOpen) {
            process.stdout.write(`📡 Dashboard still running at http://localhost:${this.dash.port}  —  press Ctrl+C to quit.\n`);
            process.stdout.write(`   Tip: \`npm run dashboard\` keeps a dashboard open and lets you re-run tests from the browser.\n`);
            await new Promise<void>(() => { /* keep serving until Ctrl+C */ });
        }
        await this.dash.close();
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
        if (this.dash) { this.dash.ingest(event, JSON.parse(JSON.stringify(data))); return; }
        if (!this.serverUrl) return;
        const body = JSON.stringify({ event, data });
        this.queue = this.queue.then(() => postJson(this.serverUrl + '/ingest', body)).catch(() => { /* dashboard closed — keep testing */ });
    }

    // ── In-process dashboard (npm run test:dashboard) ──────────

    private startServer() {
        const dash = dashboardServer.createDashboard({ root: this.rootDir, port: this.port });
        dash.listen(10).then((port: number) => {
            this.dash = dash;
            this.dash.ingest('snapshot', JSON.parse(JSON.stringify(this.snapshot())));
            const url = `http://localhost:${port}`;
            process.stdout.write(`\n📊 Live test dashboard: ${url}${port !== this.port ? `  (port ${this.port} was busy)` : ''}\n\n`);
            if (this.autoOpen) openBrowser(url);
        }).catch((e: NodeJS.ErrnoException) => {
            process.stdout.write(`⚠️  Live dashboard could not start (${e.code || e.message}). Tests will still run.\n`);
        });
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
            snap.history = dashboardServer.readHistory(this.rootDir);
            fs.writeFileSync(path.join(this.outDir, 'state.js'), 'window.__STATIC_STATE__ = ' + JSON.stringify(snap) + ';');
            for (const f of ['index.html', 'detail.html', 'dashboard.css', 'dashboard.js'])
                fs.copyFileSync(path.join(this.uiDir, 'ui', f), path.join(this.outDir, f));
        } catch (e) {
            process.stdout.write(`⚠️  Could not write static dashboard report: ${(e as Error).message}\n`);
        }
    }
}

function openBrowser(url: string) {
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => { /* ignore — user can open the URL manually */ });
}

function safeJson(s?: string) { try { return s ? JSON.parse(s) : null; } catch { return null; } }

function postJson(url: string, body: string): Promise<void> {
    return new Promise((resolve) => {
        const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => { res.resume(); res.on('end', () => resolve()); });
        req.on('error', () => resolve());
        req.end(body);
    });
}

export default LiveDashboardReporter;
