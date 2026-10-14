/* FinCore live test dashboard — no dependencies, works live (SSE) or as a static report (state.js). */
(() => {
  const COLORS = {
    passed: 'var(--pass)', flaky: 'var(--flaky)', 'known-bug': 'var(--known)', 'likely-app-bug': 'var(--fail)',
    'likely-test-env': 'var(--env)', 'needs-triage': 'var(--triage)', skipped: 'var(--skip)',
  };
  const LABELS = {
    passed: 'Passed', flaky: 'Flaky', 'known-bug': 'Known bug', 'likely-app-bug': 'Likely app bug',
    'likely-test-env': 'Likely test / env issue', 'needs-triage': 'Needs triage', skipped: 'Skipped',
    running: 'Running', retrying: 'Retrying',
  };
  const ICON = { passed: '✓', flaky: '!', 'known-bug': 'B', 'likely-app-bug': '✕', 'likely-test-env': '✕', 'needs-triage': '?', skipped: '–' };
  const FAILISH = ['likely-app-bug', 'likely-test-env', 'needs-triage'];
  const ORDER = ['passed', 'flaky', 'known-bug', 'likely-app-bug', 'likely-test-env', 'needs-triage', 'skipped'];

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDur = ms => { const s = Math.round(ms / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`; };
  const clock = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

  const STATIC = window.__STATIC_STATE__ || null;
  let state = STATIC || { run: null, tests: [] };
  const byId = new Map();
  const reindex = () => { byId.clear(); for (const t of state.tests) byId.set(t.id, t); };
  reindex();
  let clockSkew = 0;
  const seenFail = new Set(), seenFeed = new Set();   // server now - local now

  // ── Data source ──────────────────────────────────────────────
  function connect(onChange) {
    if (STATIC) { onChange(); return; }
    const es = new EventSource('/events');
    es.addEventListener('snapshot', e => { state = JSON.parse(e.data); reindex(); syncClock(); onChange(); });
    es.addEventListener('end', e => { state = JSON.parse(e.data); reindex(); syncClock(); onChange(); });
    es.addEventListener('test', e => {
      const { test, run } = JSON.parse(e.data);
      const prev = byId.get(test.id);
      if (prev) Object.assign(prev, test); else { state.tests.push(test); byId.set(test.id, test); }
      state.run = run; syncClock(); onChange(test, prev);
    });
    es.onerror = () => {
      if (state.run && state.run.status !== 'running') { es.close(); return; }
      setStatus('interrupted', 'Disconnected');
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

  function setStatus(cls, text) { const el = $('status'); el.className = 'pill ' + cls; $('statusText').textContent = text; }

  // ── Index page ───────────────────────────────────────────────
  function renderIndex(changed) {
    const run = state.run; if (!run) return;
    const c = counts();
    $('workers').textContent = run.workers; $('retries').textContent = run.retries;
    const st = run.status;
    setStatus(st, st === 'running' ? 'Running' : st === 'passed' ? (c.failed ? 'Finished' : 'All passed') : st === 'failed' ? 'Finished · failures' : st);
    $('mode').textContent = STATIC ? 'Static report' : 'Live · streaming from Playwright';

    // ring
    const R = 100, C = 2 * Math.PI * R, ring = $('ring');
    ring.querySelectorAll('.seg').forEach(n => n.remove());
    let offset = 0;
    for (const k of ORDER) {
      const v = c[k]; if (!v) continue;
      const len = C * v / Math.max(1, c.total);
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      el.setAttribute('class', 'seg'); el.setAttribute('cx', 115); el.setAttribute('cy', 115); el.setAttribute('r', R);
      el.setAttribute('stroke', getComputedStyle(document.documentElement).getPropertyValue(COLORS[k].slice(4, -1)));
      el.setAttribute('stroke-dasharray', `${len} ${C - len}`); el.setAttribute('stroke-dashoffset', -offset);
      ring.appendChild(el); offset += len;
    }
    const pct = c.total ? Math.floor(c.done / c.total * 100) : 0;
    $('pct').textContent = pct + '%';
    $('of').textContent = `${c.done} / ${c.total} tests`;

    // KPIs
    const setK = (id, v) => { const el = $(id); if (el.textContent !== String(v)) { el.textContent = v; const k = el.parentElement; k.classList.remove('bump'); void k.offsetWidth; k.classList.add('bump'); } };
    setK('k-total', c.total); setK('k-passed', c.passed); setK('k-failed', c.failed); setK('k-flaky', c.flaky); setK('k-known', c['known-bug']);
    const executed = c.done - c.skipped;
    setK('k-rate', executed ? Math.round((c.passed + c.flaky + c['known-bug']) / executed * 100) + '%' : '—');

    // bar
    $('bar').innerHTML = ORDER.filter(k => c[k]).map(k => `<div style="width:${c[k] / c.total * 100}%;background:${COLORS[k]}" title="${LABELS[k]}: ${c[k]}"></div>`).join('')
      + (st === 'running' ? '<span class="running-glow"></span>' : '');
    $('remaining').textContent = st === 'running' ? `${c.total - c.done} remaining` : `Finished in ${fmtDur((run.finishedAt || Date.now()) - run.startedAt)}`;

    // now running
    const runningTests = (run.running || []).map(id => byId.get(id)).filter(Boolean);
    const now = $('now');
    if (st === 'running' && runningTests.length) {
      const t = runningTests[0];
      now.className = 'now'; $('spin').style.display = '';
      $('nowT').textContent = t.title;
      $('nowS').textContent = `${t.spec}.spec.ts${t.describe ? ' · ' + t.describe : ''}${t.status === 'retrying' ? ' · retry ' + t.attempts.length : ''}`;
    } else {
      now.className = 'now idle'; $('spin').style.display = 'none';
      $('nowT').textContent = st === 'running' ? 'Starting…' : `Run complete — ${c.passed} passed, ${c.failed} failed, ${c.flaky} flaky, ${c['known-bug']} known bug${c['known-bug'] === 1 ? '' : 's'}`;
      $('nowS').textContent = st === 'running' ? '' : 'Click any failure for the error, steps, screenshot, video and trace.';
    }

    // specs
    const specs = new Map();
    for (const t of state.tests) {
      const s = specs.get(t.spec) || { name: t.spec, total: 0, done: 0, cats: {}, dur: 0, running: false };
      s.total++; if (t.status === 'done') { s.done++; s.cats[t.category] = (s.cats[t.category] || 0) + 1; s.dur += t.duration; }
      if (t.status === 'running' || t.status === 'retrying') s.running = true;
      specs.set(t.spec, s);
    }
    $('specCount').textContent = `${specs.size} specs`;
    $('specs').innerHTML = [...specs.values()].map(s => {
      const f = FAILISH.reduce((a, k) => a + (s.cats[k] || 0), 0);
      const icon = s.running ? '<div class="spin" style="width:14px;height:14px"></div>'
        : s.done < s.total ? '<span style="color:var(--dim)">○</span>'
        : f ? '<span style="color:var(--fail)">✕</span>' : '<span style="color:var(--pass)">✓</span>';
      return `<tr><td class="st">${icon}</td><td class="name">${esc(s.name)}</td>
        <td><div class="mini">${ORDER.filter(k => s.cats[k]).map(k => `<div style="width:${s.cats[k] / s.total * 100}%;background:${COLORS[k]}"></div>`).join('')}</div></td>
        <td class="cnt">${s.done}/${s.total}${f ? ` · <span style="color:var(--fail)">${f}✕</span>` : ''}</td></tr>`;
    }).join('');

    // triage chips + failures list
    const issues = state.tests.filter(t => t.status === 'done' && t.category && t.category !== 'passed' && t.category !== 'skipped');
    const kinds = ['likely-app-bug', 'likely-test-env', 'needs-triage', 'flaky', 'known-bug'];
    window.__filter = window.__filter || 'all';
    $('chips').innerHTML = `<span class="tchip ${window.__filter === 'all' ? 'on' : ''}" data-f="all">All <b>${issues.length}</b></span>` +
      kinds.map(k => `<span class="tchip ${window.__filter === k ? 'on' : ''}" data-f="${k}"><span class="badge b-${k}">${LABELS[k]}</span><b>${c[k]}</b></span>`).join('');
    $('chips').querySelectorAll('.tchip').forEach(ch => ch.onclick = () => { window.__filter = ch.dataset.f; renderIndex(); });
    const shown = issues.filter(t => window.__filter === 'all' || t.category === window.__filter)
      .sort((a, b) => kinds.indexOf(a.category) - kinds.indexOf(b.category) || (b.finishedAt || 0) - (a.finishedAt || 0));
    $('fails').innerHTML = shown.length ? shown.map(t => {
      const last = t.attempts[t.attempts.length - 1] || {};
      const firstErr = (t.attempts.find(a => a.error) || {}).error || '';
      const isNew = !seenFail.has(t.id); seenFail.add(t.id);
      return `<div class="fail${isNew ? ' new' : ''}" style="--c:${COLORS[t.category]}" data-id="${esc(t.id)}">
        <div class="ft">${esc(t.title)}</div>
        <div class="fm"><span class="badge b-${t.category}">${LABELS[t.category]}</span><span>${esc(t.spec)}.spec.ts:${t.line}</span>
          <span>${t.attempts.length} attempt${t.attempts.length > 1 ? 's' : ''}</span><span>${fmtDur(t.duration)}</span>${t.knownBug ? `<span>${esc(t.knownBug)}</span>` : ''}</div>
        ${firstErr ? `<div class="fe">${esc(firstErr.split('\n').find(l => l.trim()) || '')}</div>` : ''}
      </div>`;
    }).join('') : `<div class="empty">${st === 'running' ? 'No failures so far ✓' : 'No failures 🎉'}</div>`;
    $('fails').querySelectorAll('.fail').forEach(el => el.onclick = () => {
      window.open(`detail.html?id=${encodeURIComponent(el.dataset.id)}`, 'test-' + el.dataset.id.slice(0, 12), 'width=1320,height=900');
    });

    // feed
    const finished = state.tests.filter(t => t.status === 'done').sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0)).slice(0, 12);
    $('feedInfo').textContent = finished.length ? 'latest results' : '';
    $('feed').innerHTML = finished.map(t => { const isNew = !seenFeed.has(t.id); seenFeed.add(t.id); return `<li class="${isNew ? 'new' : ''}"><span class="ic" style="background:${COLORS[t.category]}">${ICON[t.category] || '•'}</span>
      <span class="tt">${esc(t.title)} <span style="color:var(--dim)">· ${esc(t.spec)}</span></span><span class="d">${fmtDur(t.duration)}</span></li>`; }).join('');

    tick();
  }

  function tick() {
    const run = state.run; if (!run) return;
    const end = run.status === 'running' ? Date.now() + clockSkew : (run.finishedAt || Date.now());
    const elapsed = end - run.startedAt;
    $('elapsed').textContent = clock(elapsed);
    const c = counts();
    if (run.status !== 'running') $('eta').textContent = 'done';
    else if (c.done >= 3) $('eta').textContent = clock(elapsed / c.done * (c.total - c.done));
    else $('eta').textContent = '—';
  }

  // ── Detail page ──────────────────────────────────────────────
  let attemptIdx = null;
  function renderDetail() {
    const id = new URLSearchParams(location.search).get('id');
    const t = byId.get(id);
    if (!t) { $('title').textContent = state.tests.length ? 'Test not found' : 'Loading…'; return; }
    document.title = `${t.title} · FinCore tests`;
    const cat = t.status === 'done' ? t.category : t.status;
    const color = COLORS[cat] || 'var(--run)';
    $('crumb').textContent = `${t.file}:${t.line}${t.describe ? '  ›  ' + t.describe : ''}`;
    $('title').textContent = t.title;
    $('badges').innerHTML = `<span class="badge b-${cat}">${LABELS[cat] || cat}</span>` + (t.knownBug ? ` <span class="badge b-known-bug">${esc(t.knownBug)}</span>` : '');
    const why = $('why'); why.style.setProperty('--c', color);
    why.innerHTML = t.status === 'done' ? `<b>Why it's classified as “${LABELS[cat]}”:</b> ${esc(t.reason || '')}` : `<b>Still running…</b> this page updates automatically.`;
    $('mgrid').innerHTML = [
      ['Spec', `${t.spec}.spec.ts`], ['Attempts', t.attempts.length], ['Total time', fmtDur(t.duration)],
      ['Final status', t.attempts.length ? t.attempts[t.attempts.length - 1].status : t.status],
    ].map(([l, v]) => `<div class="kpi" style="--c:${color}"><div class="n">${esc(v)}</div><div class="l">${l}</div></div>`).join('');

    if (attemptIdx === null || attemptIdx >= t.attempts.length) attemptIdx = Math.max(0, t.attempts.findIndex(a => a.status !== 'passed'));
    $('tabs').innerHTML = t.attempts.map((a, i) => `<span class="tab ${i === attemptIdx ? 'on' : ''}" data-i="${i}">Attempt ${i + 1}${i ? ' (retry)' : ''} · ${a.status} · ${fmtDur(a.duration)}</span>`).join('');
    $('tabs').querySelectorAll('.tab').forEach(el => el.onclick = () => { attemptIdx = +el.dataset.i; renderDetail(); });

    const a = t.attempts[attemptIdx];
    if (!a) { $('attempt').innerHTML = ''; return; }
    const shots = a.attachments.filter(x => x.contentType.startsWith('image/'));
    const vids = a.attachments.filter(x => x.contentType.startsWith('video/'));
    const trace = a.attachments.find(x => x.name === 'trace');
    const tracePath = trace ? (STATIC ? trace.url : decodeURIComponent(trace.url.split('f=')[1] || '')) : '';
    $('attempt').innerHTML = `
      <div class="dgrid">
        <div class="card"><h2>Error${a.location ? ` <span style="text-transform:none;letter-spacing:0;font-weight:500">${esc(a.location)}</span>` : ''}</h2>
          ${a.error ? `<pre class="err">${esc(a.error)}</pre>` : '<div class="empty">No error — this attempt passed.</div>'}
          ${a.snippet ? `<pre class="snip">${esc(a.snippet)}</pre>` : ''}
        </div>
        <div class="card"><h2>Steps <span style="text-transform:none;letter-spacing:0;font-weight:500">${a.steps.length} recorded</span></h2>
          <ul class="steps">${a.steps.map(s => `<li class="${s.error ? 'bad' : ''}"><span>${esc(s.title)}</span><span class="sd">${s.duration}ms</span></li>`).join('') || '<li>No steps recorded</li>'}</ul>
        </div>
      </div>
      <div class="media">
        ${shots.map(s => `<figure><figcaption>Screenshot at failure</figcaption><img src="${esc(s.url)}" alt="Screenshot"></figure>`).join('')}
        ${vids.map(v => `<figure><figcaption>Video of this attempt</figcaption><video src="${esc(v.url)}" controls muted></video></figure>`).join('')}
        ${!shots.length && !vids.length ? '<div class="empty" style="grid-column:1/-1">No screenshot or video for this attempt.</div>' : ''}
      </div>
      ${trace ? `<div class="card trace"><a class="btn" href="${esc(trace.url)}" download>⬇ Download trace</a>
        <span style="color:var(--muted)">Open it with</span> <code class="cmd">npx playwright show-trace ${esc(tracePath)}</code>
        <span style="color:var(--muted)">or drop the file on</span> <a href="https://trace.playwright.dev" target="_blank" rel="noopener">trace.playwright.dev</a></div>` : ''}`;
    $('attempt').querySelectorAll('.media img').forEach(img => img.onclick = () => { const z = $('zoom'); z.querySelector('img').src = img.src; z.style.display = 'grid'; });
  }

  // ── Boot ─────────────────────────────────────────────────────
  const page = document.body.dataset.page;
  if (page === 'index') {
    connect(() => renderIndex());
    setInterval(tick, 1000);
  } else {
    $('zoom').onclick = () => ($('zoom').style.display = 'none');
    let pending = false;
    connect((test) => {
      const id = new URLSearchParams(location.search).get('id');
      if (test && test.id !== id && state.tests.length) return;
      if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; renderDetail(); }); }
    });
  }
})();
