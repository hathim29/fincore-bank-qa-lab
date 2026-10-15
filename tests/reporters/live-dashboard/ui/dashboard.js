/* FinCore test dashboard — no dependencies.
   Works three ways: permanent dashboard with run controls (npm run dashboard),
   single live run (npm run test:dashboard), or static report (state.js). */
(() => {
  const COLORS = {
    passed: 'var(--pass)', flaky: 'var(--flaky)', 'known-bug': 'var(--known)', 'likely-app-bug': 'var(--fail)',
    'likely-test-env': 'var(--env)', 'needs-triage': 'var(--triage)', skipped: 'var(--skip)',
  };
  const LABELS = {
    passed: 'Passed', flaky: 'Flaky', 'known-bug': 'Known bug', 'likely-app-bug': 'Likely app bug',
    'likely-test-env': 'Likely test / env issue', 'needs-triage': 'Needs triage', skipped: 'Skipped',
    running: 'Running', retrying: 'Retrying', queued: 'Queued',
  };
  const ICON = { passed: '✓', flaky: '!', 'known-bug': 'B', 'likely-app-bug': '✕', 'likely-test-env': '✕', 'needs-triage': '?', skipped: '–' };
  const FAILISH = ['likely-app-bug', 'likely-test-env', 'needs-triage'];
  const ORDER = ['passed', 'flaky', 'known-bug', 'likely-app-bug', 'likely-test-env', 'needs-triage', 'skipped'];

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDur = ms => { const s = Math.round((ms || 0) / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`; };
  const clock = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  const when = ts => { const d = new Date(ts); return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); };
  const cssVar = v => getComputedStyle(document.documentElement).getPropertyValue(v.slice(4, -1)).trim();

  const STATIC = window.__STATIC_STATE__ || null;
  let state = STATIC ? { run: STATIC.run, tests: STATIC.tests } : { run: null, tests: [] };
  let history = STATIC?.history || [];
  let control = { enabled: false };
  const byId = new Map();
  const reindex = () => { byId.clear(); for (const t of state.tests) byId.set(t.id, t); };
  reindex();
  let clockSkew = 0;
  const seenFail = new Set(), seenFeed = new Set();

  // ── Data source ──────────────────────────────────────────────
  function connect(onChange) {
    if (STATIC) { onChange(); return; }
    const es = new EventSource('/events');
    es.addEventListener('snapshot', e => { state = JSON.parse(e.data); reindex(); syncClock(); onChange(); });
    es.addEventListener('end', e => { state = JSON.parse(e.data); reindex(); syncClock(); onChange(); });
    es.addEventListener('history', e => { history = JSON.parse(e.data); onChange(); });
    es.addEventListener('control', e => { control = JSON.parse(e.data); onChange(); });
    es.addEventListener('test', e => {
      const { test, run } = JSON.parse(e.data);
      const prev = byId.get(test.id);
      if (prev) Object.assign(prev, test); else { state.tests.push(test); byId.set(test.id, test); }
      state.run = run; syncClock(); onChange(test, prev);
    });
    es.onerror = () => {
      if (control.enabled) return;                         // permanent dashboard: EventSource reconnects by itself
      if (state.run && state.run.status !== 'running') { es.close(); return; }
      if ($('status')) setStatus('interrupted', 'Disconnected');
    };
  }
  const syncClock = () => { if (state.run?.now) clockSkew = state.run.now - Date.now(); };

  function counts() {
    const c = { total: state.tests.length, done: 0 };
    for (const k of ORDER) c[k] = 0;
    for (const t of state.tests) if (t.status === 'done' && t.category) { c[t.category]++; c.done++; }
    c.failed = FAILISH.reduce((a, k) => a + c[k], 0);
    return c;
  }
  // A run was requested but its reporter hasn't reported in yet (browser + server starting up)
  const isStarting = () => control.enabled && control.running && (!state.run || state.run.status !== 'running' || (control.options && state.run.startedAt < control.options.startedAt - 2000));

  function setStatus(cls, text) { const el = $('status'); el.className = 'pill ' + cls; $('statusText').textContent = text; }

  // Per-test history across saved runs: [{ run, cat, dur }] oldest → newest
  function testHistory(id) {
    return history.map(h => ({ run: h, r: h.results[id] })).map(({ run, r }) => ({ run, cat: r ? r[0] : null, dur: r ? r[1] : null }));
  }
  function strip(id, max = 20, big = false) {
    const h = testHistory(id).filter(x => x.cat).slice(-max);       // only runs that included this test
    if (!h.length) return '<span class="hstrip empty-h">no history yet</span>';
    return `<span class="hstrip${big ? ' big' : ''}">` + h.map(x => `<i style="background:${x.cat ? COLORS[x.cat] : 'transparent'}" class="${x.cat ? '' : 'na'}"
      title="${esc(when(x.run.startedAt))} · ${x.cat ? LABELS[x.cat] + ' · ' + fmtDur(x.dur) : 'not run'}"></i>`).join('') + '</span>';
  }

  async function api(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    return r.json().catch(() => ({}));
  }
  function openDetail(id) {
    window.open(`detail.html?id=${encodeURIComponent(id)}`, 'test-' + id.slice(0, 12), 'width=1320,height=900');
  }

  // ── Index page ───────────────────────────────────────────────
  function renderIndex() {
    renderControls();
    renderRuns();
    const env = (state.run && state.run.env) || control.env;
    const chip = $('envChip');
    if (env) { chip.style.display = ''; chip.innerHTML = `Env <b style="color:var(--teal)">${esc(env.name)}</b> <span style="color:var(--dim)">· ${esc(env.host)}</span>`; chip.title = env.url; }
    else chip.style.display = 'none';
    const run = state.run;
    $('empty').style.display = run ? 'none' : '';
    $('main').style.display = run ? '' : 'none';
    if (!run) { if (isStarting()) setStatus('running', 'Starting'); else setStatus('passed', control.enabled ? 'Ready' : 'Waiting'); return; }
    const c = counts();
    $('workers').textContent = run.workers; $('retries').textContent = run.retries;
    const st = isStarting() ? 'running' : run.status;
    setStatus(st, isStarting() ? 'Starting run' : st === 'running' ? 'Running' : st === 'passed' ? (c.failed ? 'Finished' : 'All passed') : st === 'failed' ? 'Finished · failures' : st === 'interrupted' ? 'Stopped' : st);
    $('mode').textContent = STATIC ? 'Static report' : control.enabled ? 'Live · dashboard server' : 'Live · streaming from Playwright';

    // ring
    const R = 100, C = 2 * Math.PI * R, ring = $('ring');
    ring.querySelectorAll('.seg').forEach(n => n.remove());
    let offset = 0;
    for (const k of ORDER) {
      const v = c[k]; if (!v) continue;
      const len = C * v / Math.max(1, c.total);
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      el.setAttribute('class', 'seg'); el.setAttribute('cx', 115); el.setAttribute('cy', 115); el.setAttribute('r', R);
      el.setAttribute('stroke', cssVar(COLORS[k]));
      el.setAttribute('stroke-dasharray', `${len} ${C - len}`); el.setAttribute('stroke-dashoffset', -offset);
      ring.appendChild(el); offset += len;
    }
    const pct = c.total ? Math.floor(c.done / c.total * 100) : 0;
    $('pct').textContent = pct + '%';
    $('of').textContent = `${c.done} / ${c.total} tests`;

    const setK = (id, v) => { const el = $(id); if (el.textContent !== String(v)) { el.textContent = v; const k = el.parentElement; k.classList.remove('bump'); void k.offsetWidth; k.classList.add('bump'); } };
    setK('k-total', c.total); setK('k-passed', c.passed); setK('k-failed', c.failed); setK('k-flaky', c.flaky); setK('k-known', c['known-bug']);
    const executed = c.done - c.skipped;
    setK('k-rate', executed ? Math.round((c.passed + c.flaky + c['known-bug']) / executed * 100) + '%' : '—');

    $('bar').innerHTML = ORDER.filter(k => c[k]).map(k => `<div style="width:${c[k] / c.total * 100}%;background:${COLORS[k]}" title="${LABELS[k]}: ${c[k]}"></div>`).join('')
      + (st === 'running' ? '<span class="running-glow"></span>' : '');
    $('remaining').textContent = st === 'running' ? `${c.total - c.done} remaining` : `Finished in ${fmtDur((run.finishedAt || Date.now()) - run.startedAt)}`;
    const opt = isStarting() ? control.options : (run.options || control.options);
    const envName = (run.env || control.env || {}).name;
    $('runLabel').innerHTML = opt ? `${esc(opt.label)} · ${esc(opt.browsers.join(', '))}${opt.headed ? ' · headed' : ''}${envName ? ` · <b>${esc(envName)}</b>` : ''}` : '';

    // now running
    const runningTests = (run.running || []).map(id => byId.get(id)).filter(Boolean);
    const now = $('now');
    if (st === 'running' && runningTests.length && !isStarting()) {
      const t = runningTests[0];
      now.className = 'now'; $('spin').style.display = '';
      $('nowT').textContent = t.title;
      $('nowS').textContent = `${t.spec}.spec.ts${t.describe ? ' · ' + t.describe : ''}${t.project && t.project !== 'chromium' ? ' · ' + t.project : ''}${t.status === 'retrying' ? ' · retry ' + t.attempts.length : ''}`;
    } else if (isStarting()) {
      now.className = 'now'; $('spin').style.display = '';
      $('nowT').textContent = `Starting: ${control.options?.label || 'run'}…`;
      $('nowS').textContent = 'Launching browser and checking the app server';
    } else {
      now.className = 'now idle'; $('spin').style.display = 'none';
      $('nowT').textContent = st === 'running' ? 'Starting…' : `Run complete — ${c.passed} passed, ${c.failed} failed, ${c.flaky} flaky, ${c['known-bug']} known bug${c['known-bug'] === 1 ? '' : 's'}`;
      $('nowS').textContent = st === 'running' ? '' : 'Click a spec to see its tests, or any test for its details and history.';
    }

    // specs
    const specs = new Map();
    for (const t of state.tests) {
      const s = specs.get(t.spec) || { name: t.spec, file: t.file, total: 0, done: 0, cats: {}, dur: 0, running: false };
      s.total++; if (t.status === 'done') { s.done++; s.cats[t.category] = (s.cats[t.category] || 0) + 1; s.dur += t.duration; }
      if (t.status === 'running' || t.status === 'retrying') s.running = true;
      specs.set(t.spec, s);
    }
    $('specCount').textContent = `${specs.size} spec${specs.size === 1 ? '' : 's'} · click to open`;
    $('specs').innerHTML = [...specs.values()].map(s => {
      const f = FAILISH.reduce((a, k) => a + (s.cats[k] || 0), 0);
      const icon = s.running ? '<div class="spin" style="width:14px;height:14px"></div>'
        : s.done < s.total ? '<span style="color:var(--dim)">○</span>'
        : f ? '<span style="color:var(--fail)">✕</span>' : '<span style="color:var(--pass)">✓</span>';
      return `<tr class="click" data-spec="${esc(s.name)}"><td class="st">${icon}</td><td class="name">${esc(s.name)}</td>
        <td><div class="mini">${ORDER.filter(k => s.cats[k]).map(k => `<div style="width:${s.cats[k] / s.total * 100}%;background:${COLORS[k]}"></div>`).join('')}</div></td>
        <td class="cnt">${s.done}/${s.total}${f ? ` · <span style="color:var(--fail)">${f}✕</span>` : ''}</td><td class="chev">›</td></tr>`;
    }).join('');
    $('specs').querySelectorAll('tr.click').forEach(tr => tr.onclick = () => openSpec(tr.dataset.spec));
    if (openSpecName) renderSpecDrawer();

    // triage
    const issues = state.tests.filter(t => t.status === 'done' && t.category && t.category !== 'passed' && t.category !== 'skipped');
    const kinds = ['likely-app-bug', 'likely-test-env', 'needs-triage', 'flaky', 'known-bug'];
    window.__filter = window.__filter || 'all';
    $('chips').innerHTML = `<span class="tchip ${window.__filter === 'all' ? 'on' : ''}" data-f="all">All <b>${issues.length}</b></span>` +
      kinds.map(k => `<span class="tchip ${window.__filter === k ? 'on' : ''}" data-f="${k}"><span class="badge b-${k}">${LABELS[k]}</span><b>${c[k]}</b></span>`).join('');
    $('chips').querySelectorAll('.tchip').forEach(ch => ch.onclick = () => { window.__filter = ch.dataset.f; renderIndex(); });
    const shown = issues.filter(t => window.__filter === 'all' || t.category === window.__filter)
      .sort((a, b) => kinds.indexOf(a.category) - kinds.indexOf(b.category) || (b.finishedAt || 0) - (a.finishedAt || 0));
    $('fails').innerHTML = shown.length ? shown.map(t => {
      const firstErr = (t.attempts.find(a => a.error) || {}).error || '';
      const isNew = !seenFail.has(t.id); seenFail.add(t.id);
      return `<div class="fail${isNew ? ' new' : ''}" style="--c:${COLORS[t.category]}" data-id="${esc(t.id)}">
        <div class="ft">${esc(t.title)}</div>
        <div class="fm"><span class="badge b-${t.category}">${LABELS[t.category]}</span><span>${esc(t.spec)}.spec.ts:${t.line}</span>
          <span>${t.attempts.length} attempt${t.attempts.length > 1 ? 's' : ''}</span><span>${fmtDur(t.duration)}</span>${t.knownBug ? `<span>${esc(t.knownBug)}</span>` : ''}${strip(t.id, 10)}</div>
        ${firstErr ? `<div class="fe">${esc(firstErr.split('\n').find(l => l.trim()) || '')}</div>` : ''}
      </div>`;
    }).join('') : `<div class="empty">${st === 'running' ? 'No failures so far ✓' : 'No failures 🎉'}</div>`;
    $('fails').querySelectorAll('.fail').forEach(el => el.onclick = () => openDetail(el.dataset.id));

    // feed
    const finished = state.tests.filter(t => t.status === 'done').sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0)).slice(0, 12);
    $('feedInfo').textContent = finished.length ? 'latest results · click for details' : '';
    $('feed').innerHTML = finished.map(t => { const isNew = !seenFeed.has(t.id); seenFeed.add(t.id); return `<li class="click${isNew ? ' new' : ''}" data-id="${esc(t.id)}"><span class="ic" style="background:${COLORS[t.category]}">${ICON[t.category] || '•'}</span>
      <span class="tt">${esc(t.title)} <span style="color:var(--dim)">· ${esc(t.spec)}</span></span><span class="d">${fmtDur(t.duration)}</span></li>`; }).join('');
    $('feed').querySelectorAll('li.click').forEach(li => li.onclick = () => openDetail(li.dataset.id));

    tick();
  }

  function tick() {
    const run = state.run; if (!run || !$('elapsed')) return;
    const st = isStarting() ? 'running' : run.status;
    const end = st === 'running' ? Date.now() + clockSkew : (run.finishedAt || Date.now());
    const start = isStarting() ? control.options.startedAt : run.startedAt;
    const elapsed = end - start;
    $('elapsed').textContent = clock(elapsed);
    const c = counts();
    if (st !== 'running') $('eta').textContent = 'done';
    else if (c.done >= 3 && !isStarting()) $('eta').textContent = clock(elapsed / c.done * (c.total - c.done));
    else $('eta').textContent = '—';
  }

  // ── Run controls (permanent dashboard only) ──────────────────
  function renderControls() {
    const box = $('controls'); if (!box) return;
    if (!control.enabled) { box.innerHTML = ''; return; }
    const nFailed = (control.failed || []).length;
    box.innerHTML = control.running
      ? `<button class="btn danger" id="btnStop">■ Stop run</button>`
      : `${nFailed ? `<button class="btn ghost" id="btnFailed">↻ Re-run failed (${nFailed})</button>` : ''}<button class="btn" id="btnRun">▶ Run…</button>`;
    if ($('btnStop')) $('btnStop').onclick = async () => { $('btnStop').disabled = true; $('btnStop').textContent = 'Stopping…'; await api('/api/stop'); };
    if ($('btnFailed')) $('btnFailed').onclick = () => startRun({ scope: 'failed', browsers: lastBrowsers() });
    if ($('btnRun')) $('btnRun').onclick = openRunModal;
  }
  const lastBrowsers = () => (control.options && control.options.browsers) || ['chromium'];

  async function startRun(opts) {
    const r = await api('/api/run', opts);
    if (r.error) { toast(r.error, true); return false; }
    seenFail.clear(); seenFeed.clear();
    return true;
  }
  function toast(msg, bad) {
    const t = $('toast'); t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(t._h); t._h = setTimeout(() => (t.className = 'toast'), 6000);
  }

  function estimateFullRunMs() {
    const full = [...history].reverse().find(h => (!h.options || h.options.scope === 'all') && h.finishedAt);
    return full ? full.finishedAt - full.startedAt : 15 * 60000;
  }

  function openRunModal() {
    const m = $('runModal'); m.classList.add('open');
    const cat = control.catalog || [];
    const specs = [...new Map(cat.map(t => [t.file, t.spec])).entries()];
    const nFailed = (control.failed || []).length;
    const sel = { scope: 'all', file: specs[0]?.[0], test: null, browsers: new Set(lastBrowsers()), headed: false };

    const draw = () => {
      const inst = control.browsers || {};
      const nb = sel.browsers.size;
      const base = estimateFullRunMs();
      const scopeMs = sel.scope === 'all' ? base : null;
      $('runBody').innerHTML = `
        <div class="rgroup"><div class="rlabel">What to run</div>
          <label class="ropt"><input type="radio" name="scope" value="all" ${sel.scope === 'all' ? 'checked' : ''}> All tests <span class="muted">(${cat.length || '…'})</span></label>
          <label class="ropt ${nFailed ? '' : 'off'}"><input type="radio" name="scope" value="failed" ${sel.scope === 'failed' ? 'checked' : ''} ${nFailed ? '' : 'disabled'}> Failed &amp; flaky from last run <span class="muted">(${nFailed})</span></label>
          <label class="ropt"><input type="radio" name="scope" value="spec" ${sel.scope === 'spec' ? 'checked' : ''}> One spec
            <select id="rSpec" ${sel.scope === 'spec' ? '' : 'disabled'}>${specs.map(([f, n]) => `<option value="${esc(f)}" ${f === sel.file ? 'selected' : ''}>${esc(n)} (${cat.filter(t => t.file === f).length})</option>`).join('')}</select></label>
          <label class="ropt"><input type="radio" name="scope" value="test" ${sel.scope === 'test' ? 'checked' : ''}> One test
            <input id="rSearch" placeholder="Search by test name…" value="${esc(sel.test ? sel.test.title : '')}" ${sel.scope === 'test' ? '' : 'disabled'} autocomplete="off"></label>
          <div id="rResults" class="rresults"></div>
        </div>
        <div class="rgroup"><div class="rlabel">Browsers</div>
          ${['chromium', 'firefox', 'webkit'].map(b => `<label class="ropt ${inst[b] ? '' : 'off'}"><input type="checkbox" data-b="${b}" ${sel.browsers.has(b) ? 'checked' : ''} ${inst[b] ? '' : 'disabled'}>
            ${b === 'chromium' ? 'Chromium' : b === 'firefox' ? 'Firefox' : 'WebKit (Safari)'}
            ${inst[b] ? '' : `<span class="muted">— not installed: <code>npx playwright install ${b}</code></span>`}</label>`).join('')}
          ${nb > 1 ? `<div class="warn">⚠ ${nb} browsers ≈ ${nb}× the run time${scopeMs ? ` (about ${Math.round(scopeMs * nb / 60000)} min for all tests)` : ''}. Tests run one browser after another.</div>` : ''}
        </div>
        <div class="rgroup"><div class="rlabel">Options</div>
          <label class="ropt"><input type="checkbox" id="rHeaded" ${sel.headed ? 'checked' : ''}> Headed — show the browser while tests run</label>
          <div class="muted" style="margin-top:6px">Runs use 1 worker: the tests share one database, so running them in parallel would make them interfere.</div>
        </div>
        <div id="rErr" class="rerr"></div>`;
      document.querySelectorAll('input[name=scope]').forEach(r => r.onchange = () => { sel.scope = r.value; draw(); if (r.value === 'test') $('rSearch').focus(); });
      if ($('rSpec')) $('rSpec').onchange = e => { sel.file = e.target.value; };
      document.querySelectorAll('[data-b]').forEach(cb => cb.onchange = () => { cb.checked ? sel.browsers.add(cb.dataset.b) : sel.browsers.delete(cb.dataset.b); draw(); });
      $('rHeaded').onchange = e => { sel.headed = e.target.checked; };
      const search = $('rSearch');
      search.oninput = () => {
        const q = search.value.trim().toLowerCase();
        const hits = q.length < 2 ? [] : cat.filter(t => (t.title + ' ' + t.spec + ' ' + t.describe).toLowerCase().includes(q)).slice(0, 8);
        $('rResults').innerHTML = hits.map((t, i) => `<div class="rhit" data-i="${i}"><b>${esc(t.title)}</b><span class="muted"> · ${esc(t.spec)}:${t.line}</span></div>`).join('');
        $('rResults').querySelectorAll('.rhit').forEach(h => h.onclick = () => { sel.test = hits[+h.dataset.i]; search.value = sel.test.title; $('rResults').innerHTML = ''; });
      };
    };
    draw();
    $('runCancel').onclick = () => m.classList.remove('open');
    $('runStart').onclick = async () => {
      const opts = { scope: sel.scope, browsers: [...sel.browsers], headed: sel.headed };
      if (sel.scope === 'spec') opts.file = $('rSpec').value;
      if (sel.scope === 'test') { if (!sel.test) { $('rErr').textContent = 'Pick a test from the search results.'; return; } opts.file = sel.test.file; opts.line = sel.test.line; }
      const r = await api('/api/run', opts);
      if (r.error) { $('rErr').textContent = r.error; return; }
      seenFail.clear(); seenFeed.clear();
      m.classList.remove('open');
    };
  }

  // ── Recent runs ──────────────────────────────────────────────
  function renderRuns() {
    const box = $('runs'); if (!box) return;
    const list = [...history].reverse();
    $('runsCard').style.display = list.length ? '' : 'none';
    $('runsInfo').textContent = list.length ? `last ${list.length} run${list.length === 1 ? '' : 's'}` : '';
    box.innerHTML = list.map(h => {
      const fails = FAILISH.reduce((a, k) => a + (h.counts[k] || 0), 0);
      const done = Object.values(h.counts).reduce((a, b) => a + b, 0) || 1;
      const label = h.options ? h.options.label : 'All tests';
      const br = (h.options ? h.options.browsers.join(', ') : 'chromium') + (h.env ? ' · ' + h.env.name : '');
      return `<div class="runrow">
        <span class="rdot" style="background:${h.status === 'passed' ? 'var(--pass)' : h.status === 'interrupted' ? 'var(--flaky)' : 'var(--fail)'}"></span>
        <span class="rwhen">${esc(when(h.startedAt))}</span>
        <span class="rlab" title="${esc(label)}">${esc(label)} <span class="muted">· ${esc(br)}</span></span>
        <span class="rbar">${ORDER.filter(k => h.counts[k]).map(k => `<i style="width:${h.counts[k] / done * 100}%;background:${COLORS[k]}"></i>`).join('')}</span>
        <span class="rnum">${h.counts.passed || 0}✓ ${fails ? `<b style="color:var(--fail)">${fails}✕</b>` : ''} ${h.counts.flaky ? `<b style="color:var(--flaky)">${h.counts.flaky}!</b>` : ''}</span>
        <span class="rdur">${fmtDur(h.finishedAt - h.startedAt)}</span></div>`;
    }).join('');
  }

  // ── Spec drawer ──────────────────────────────────────────────
  let openSpecName = null;
  function openSpec(name) { openSpecName = name; $('drawer').classList.add('open'); renderSpecDrawer(); }
  function renderSpecDrawer() {
    const tests = state.tests.filter(t => t.spec === openSpecName);
    if (!tests.length) { $('drawer').classList.remove('open'); openSpecName = null; return; }
    const done = tests.filter(t => t.status === 'done');
    const fails = done.filter(t => FAILISH.includes(t.category)).length;
    $('dTitle').textContent = `${openSpecName}.spec.ts`;
    $('dSub').textContent = `${tests.length} tests · ${done.filter(t => t.category === 'passed').length} passed${fails ? ` · ${fails} failed` : ''} · ${fmtDur(done.reduce((a, t) => a + t.duration, 0))}`;
    $('dActions').innerHTML = control.enabled && !control.running ? `<button class="btn ghost" id="dRunSpec">▶ Run this spec</button>` : '';
    if ($('dRunSpec')) $('dRunSpec').onclick = () => startRun({ scope: 'spec', file: tests[0].file, browsers: lastBrowsers() });
    const sortKey = window.__specSort || 'order';
    const list = sortKey === 'slowest' ? [...tests].sort((a, b) => b.duration - a.duration) : tests;
    $('dSort').querySelectorAll('span').forEach(s => { s.classList.toggle('on', s.dataset.s === sortKey); s.onclick = () => { window.__specSort = s.dataset.s; renderSpecDrawer(); }; });
    let lastGroup = null;
    $('dList').innerHTML = list.map(t => {
      const cat = t.status === 'done' ? t.category : t.status;
      const group = sortKey === 'order' && t.describe !== lastGroup ? `<div class="dgroup">${esc(t.describe || 'Tests')}</div>` : '';
      lastGroup = t.describe;
      return `${group}<div class="drow" data-id="${esc(t.id)}">
        <span class="ic" style="background:${COLORS[cat] || 'var(--panel2)'}">${cat === 'running' || cat === 'retrying' ? '' : ICON[cat] || ''}</span>
        <span class="dt"><span class="dtt">${esc(t.title)}</span>${t.project && t.project !== 'chromium' ? ` <span class="badge b-skipped">${esc(t.project)}</span>` : ''}
          <span class="muted dmeta">${LABELS[cat] || cat}${t.attempts.length > 1 ? ` · ${t.attempts.length} attempts` : ''} · line ${t.line}</span></span>
        ${strip(t.id, 10)}
        <span class="d">${t.status === 'done' ? fmtDur(t.duration) : '—'}</span><span class="chev">›</span></div>`;
    }).join('');
    $('dList').querySelectorAll('.drow').forEach(r => r.onclick = () => openDetail(r.dataset.id));
  }

  // ── Detail page ──────────────────────────────────────────────
  let attemptIdx = null;
  function renderDetail() {
    const id = new URLSearchParams(location.search).get('id');
    const t = byId.get(id);
    if (!t) { $('title').textContent = state.tests.length ? 'This test is not part of the current run' : 'Loading…'; renderHistoryCard(id, null); return; }
    document.title = `${t.title} · FinCore tests`;
    const cat = t.status === 'done' ? t.category : t.status;
    const color = COLORS[cat] || 'var(--run)';
    $('crumb').textContent = `${t.file}:${t.line}${t.describe ? '  ›  ' + t.describe : ''}${t.project ? '  ·  ' + t.project : ''}`;
    $('title').textContent = t.title;
    $('badges').innerHTML = `<span class="badge b-${cat}">${LABELS[cat] || cat}</span>` + (t.knownBug ? ` <span class="badge b-known-bug">${esc(t.knownBug)}</span>` : '');
    $('dActionsTop').innerHTML = control.enabled ? (control.running ? `<span class="muted">A run is in progress…</span>` : `<button class="btn" id="rerunOne">↻ Re-run this test</button>`) : '';
    if ($('rerunOne')) $('rerunOne').onclick = async () => {
      const r = await api('/api/run', { scope: 'test', file: t.file, line: t.line, browsers: [t.project || 'chromium'] });
      $('dActionsTop').innerHTML = r.error ? `<span style="color:var(--fail)">${esc(r.error)}</span>` : `<span class="muted">Re-run started — this page updates live.</span>`;
    };
    const why = $('why'); why.style.setProperty('--c', color);
    why.innerHTML = t.status === 'done' ? `<b>Why it's “${LABELS[cat]}”:</b> ${esc(t.reason || '')}` : `<b>${LABELS[t.status] || 'Running'}…</b> this page updates automatically.`;
    $('mgrid').innerHTML = [
      ['Spec', `${t.spec}.spec.ts`], ['Attempts', t.attempts.length], ['Total time', fmtDur(t.duration)],
      ['Final status', t.attempts.length ? t.attempts[t.attempts.length - 1].status : t.status],
    ].map(([l, v]) => `<div class="kpi" style="--c:${color}"><div class="n">${esc(v)}</div><div class="l">${l}</div></div>`).join('');
    renderHistoryCard(id, t);

    if (attemptIdx === null || attemptIdx >= t.attempts.length) attemptIdx = Math.max(0, t.attempts.findIndex(a => a.status !== 'passed'));
    $('tabs').innerHTML = t.attempts.map((a, i) => `<span class="tab ${i === attemptIdx ? 'on' : ''}" data-i="${i}">Attempt ${i + 1}${i ? ' (retry)' : ''} · ${a.status} · ${fmtDur(a.duration)}</span>`).join('');
    $('tabs').querySelectorAll('.tab').forEach(el => el.onclick = () => { attemptIdx = +el.dataset.i; renderDetail(); });

    const a = t.attempts[attemptIdx];
    if (!a) { $('attempt').innerHTML = ''; return; }
    const shots = a.attachments.filter(x => x.contentType.startsWith('image/'));
    const vids = a.attachments.filter(x => x.contentType.startsWith('video/'));
    const trace = a.attachments.find(x => x.name === 'trace');
    const tracePath = trace ? (trace.url.includes('f=') ? decodeURIComponent(trace.url.split('f=')[1]) : trace.url) : '';
    const passed = a.status === 'passed';
    $('attempt').innerHTML = `
      <div class="dgrid">
        <div class="card"><h2>${passed ? 'Result' : 'Error'}${a.location ? ` <span class="h2s">${esc(a.location)}</span>` : ''}</h2>
          ${a.error ? `<pre class="err">${esc(a.error)}</pre>` : `<div class="empty ok">✓ This attempt passed in ${fmtDur(a.duration)}.</div>`}
          ${a.snippet ? `<pre class="snip">${esc(a.snippet)}</pre>` : ''}
        </div>
        <div class="card"><h2>Steps <span class="h2s">${a.steps.length} recorded</span></h2>
          <ul class="steps">${a.steps.map(s => `<li class="${s.error ? 'bad' : ''}"><span>${esc(s.title)}</span><span class="sd">${s.duration}ms</span></li>`).join('') || '<li>No steps recorded</li>'}</ul>
        </div>
      </div>
      <div class="media">
        ${shots.map(s => `<figure><figcaption>Screenshot at failure</figcaption><img src="${esc(s.url)}" alt="Screenshot"></figure>`).join('')}
        ${vids.map(v => `<figure><figcaption>Video of this attempt</figcaption><video src="${esc(v.url)}" controls muted></video></figure>`).join('')}
        ${!shots.length && !vids.length ? `<div class="empty" style="grid-column:1/-1">${passed ? 'Screenshots, video and trace are kept only for failed attempts.' : 'No screenshot or video for this attempt.'}</div>` : ''}
      </div>
      ${trace ? `<div class="card trace"><a class="btn" href="${esc(trace.url)}" download>⬇ Download trace</a>
        <span class="muted">Open it with</span> <code class="cmd">npx playwright show-trace ${esc(tracePath)}</code>
        <span class="muted">or drop the file on</span> <a href="https://trace.playwright.dev" target="_blank" rel="noopener">trace.playwright.dev</a></div>` : ''}`;
    $('attempt').querySelectorAll('.media img').forEach(img => img.onclick = () => { const z = $('zoom'); z.querySelector('img').src = img.src; z.style.display = 'grid'; });
  }

  function renderHistoryCard(id, t) {
    const box = $('hist'); if (!box) return;
    const h = testHistory(id).filter(x => x.cat);
    if (!h.length) { box.innerHTML = `<h2>Run history</h2><div class="empty">No saved runs for this test yet. History builds up as you run the suite.</div>`; return; }
    const ok = h.filter(x => ['passed', 'known-bug'].includes(x.cat)).length;
    const flaky = h.filter(x => x.cat === 'flaky').length;
    const failed = h.filter(x => FAILISH.includes(x.cat)).length;
    const durs = h.filter(x => x.cat !== 'skipped').map(x => x.dur);
    const avg = durs.reduce((a, b) => a + b, 0) / Math.max(1, durs.length);
    const cur = t && t.status === 'done' ? t.duration : durs[durs.length - 1];
    const diff = avg ? Math.round((cur - avg) / avg * 100) : 0;
    const maxD = Math.max(...durs, 1);
    box.innerHTML = `<h2>Run history <span class="h2s">last ${h.length} run${h.length === 1 ? '' : 's'} with this test · oldest → newest</span></h2>
      <div class="hrow">
        <div class="hstats">
          <div><b style="color:var(--pass)">${ok}</b><span>passed</span></div>
          <div><b style="color:var(--fail)">${failed}</b><span>failed</span></div>
          <div><b style="color:var(--flaky)">${flaky}</b><span>flaky</span></div>
          <div><b>${fmtDur(avg)}</b><span>avg time</span></div>
          <div><b style="color:${diff > 25 ? 'var(--fail)' : diff < -25 ? 'var(--pass)' : 'var(--text)'}">${diff > 0 ? '+' : ''}${diff}%</b><span>latest vs avg</span></div>
        </div>
        <div class="hchart">${testHistory(id).map(x => `<div class="hcol" title="${esc(when(x.run.startedAt))} · ${x.cat ? LABELS[x.cat] + ' · ' + fmtDur(x.dur) : 'not run'}">
            <div class="hb" style="height:${x.cat ? Math.max(6, x.dur / maxD * 100) : 0}%;background:${x.cat ? COLORS[x.cat] : 'transparent'}"></div>
            <div class="hd" style="background:${x.cat ? COLORS[x.cat] : 'transparent'}"></div></div>`).join('')}</div>
      </div>
      <div class="muted" style="font-size:12px;margin-top:8px">Bar height = duration, colour = result. Hover a bar for the date.</div>`;
  }

  // ── Boot ─────────────────────────────────────────────────────
  const page = document.body.dataset.page;
  if (page === 'index') {
    $('dClose').onclick = () => { $('drawer').classList.remove('open'); openSpecName = null; };
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('drawer').classList.remove('open'); openSpecName = null; $('runModal').classList.remove('open'); } });
    let pending = false;
    connect(() => { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; renderIndex(); }); } });
    setInterval(tick, 1000);
  } else {
    $('zoom').onclick = () => ($('zoom').style.display = 'none');
    let pending = false;
    connect((test) => {
      const id = new URLSearchParams(location.search).get('id');
      if (test && test.id !== id && state.tests.length && byId.has(id)) return;
      if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; renderDetail(); }); }
    });
  }
})();
