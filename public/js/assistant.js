// FinCore Assistant — chat widget (loaded on every page by sidebar.js)
// Shows only when the server says the assistant is enabled. The server
// enforces the flag too, so hiding the widget is a convenience, not security.

(function () {
    if (window.__finCoreAssistantLoaded) return;
    window.__finCoreAssistantLoaded = true;

    const API = '/api/assistant';
    const user = JSON.parse(sessionStorage.getItem('fincore_user') || 'null');
    if (!user || /login\.html$/.test(location.pathname)) return;

    const http = (url, opts = {}) => (window.authFetch || fetch)(url, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            'x-fincore-role': user.role || 'viewer',
            'x-fincore-user': user.username || '',
            ...(opts.headers || {}),
        },
    });

    const SUGGESTIONS = ['What is my balance?', 'Show recent transactions', 'When is my next EMI?', 'Block my credit card'];

    const state = { open: false, conversationId: null, customerId: null, busy: false, showTools: true };
    let els = {};

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function format(text) {
        // **bold** only — never touch masked card numbers like "**** **** **** 1234"
        return escapeHtml(text).replace(/\*\*([^*\s][^*]*?[^*\s]|[^*\s])\*\*/g, '<strong>$1</strong>');
    }

    function addCss() {
        if (document.querySelector('link[href$="css/assistant.css"]')) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'css/assistant.css';
        document.head.appendChild(link);
    }

    function addSettingsNav() {
        if (user.role !== 'admin') return;
        const nav = document.querySelector('.sidebar-nav');
        if (!nav || nav.querySelector('[data-testid="nav-assistant-settings"]')) return;
        const a = document.createElement('a');
        a.href = 'assistant-settings.html';
        a.className = 'nav-item' + (/assistant-settings\.html$/.test(location.pathname) ? ' active' : '');
        a.setAttribute('data-testid', 'nav-assistant-settings');
        a.setAttribute('data-tooltip', 'AI Assistant');
        a.innerHTML = '<i class="ti ti-message-chatbot nav-icon"></i><span>AI Assistant</span>';
        nav.appendChild(a);
    }

    function build() {
        const launcher = document.createElement('button');
        launcher.className = 'fa-launcher';
        launcher.setAttribute('data-testid', 'assistant-launcher');
        launcher.setAttribute('aria-label', 'Open FinCore Assistant');
        launcher.innerHTML = '<i class="ti ti-message-chatbot"></i>';

        const panel = document.createElement('section');
        panel.className = 'fa-panel';
        panel.hidden = true;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'FinCore Assistant');
        panel.setAttribute('data-testid', 'assistant-panel');
        panel.innerHTML = `
            <div class="fa-header">
                <i class="ti ti-message-chatbot fa-header-icon"></i>
                <div class="fa-header-text">
                    <div class="fa-title">FinCore Assistant</div>
                    <div class="fa-subtitle" data-testid="assistant-subtitle">AI assistant · may make mistakes</div>
                </div>
                <button class="fa-icon-btn" data-testid="assistant-new-chat" title="New conversation" aria-label="New conversation"><i class="ti ti-refresh"></i></button>
                <button class="fa-icon-btn" data-testid="assistant-close" title="Close" aria-label="Close"><i class="ti ti-x"></i></button>
            </div>
            <div class="fa-customer">
                <label for="fa-customer-select">Acting as</label>
                <select id="fa-customer-select" data-testid="assistant-customer-select"><option value="">Loading customers…</option></select>
            </div>
            <div class="fa-messages" data-testid="assistant-messages" aria-live="polite"></div>
            <div class="fa-suggestions" data-testid="assistant-suggestions"></div>
            <div class="fa-input-row">
                <textarea class="fa-input" data-testid="assistant-input" placeholder="Ask about accounts, loans, cards…" maxlength="1000" aria-label="Message"></textarea>
                <button class="fa-send" data-testid="assistant-send" aria-label="Send"><i class="ti ti-send"></i></button>
            </div>
            <div class="fa-footnote">Demo data only. The assistant can only see the selected customer.</div>`;

        document.body.appendChild(launcher);
        document.body.appendChild(panel);

        els = {
            launcher, panel,
            messages: panel.querySelector('.fa-messages'),
            input: panel.querySelector('.fa-input'),
            send: panel.querySelector('.fa-send'),
            select: panel.querySelector('select'),
            suggestions: panel.querySelector('.fa-suggestions'),
        };

        SUGGESTIONS.forEach(s => {
            const b = document.createElement('button');
            b.className = 'fa-chip';
            b.textContent = s;
            b.setAttribute('data-testid', 'assistant-suggestion');
            b.addEventListener('click', () => send(s));
            els.suggestions.appendChild(b);
        });

        launcher.addEventListener('click', () => toggle());
        panel.querySelector('[data-testid="assistant-close"]').addEventListener('click', () => toggle(false));
        panel.querySelector('[data-testid="assistant-new-chat"]').addEventListener('click', () => reset());
        els.send.addEventListener('click', () => send(els.input.value));
        els.input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); send(els.input.value); }
        });
        els.select.addEventListener('change', () => { state.customerId = Number(els.select.value) || null; reset(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.open) toggle(false); });
    }

    async function loadCustomers() {
        try {
            const res = await (window.authFetch || fetch)('/api/customers?limit=100');
            const { data = [] } = await res.json();
            data.sort((a, b) => a.name.localeCompare(b.name));
            els.select.innerHTML = data.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (#${c.id})</option>`).join('');
            state.customerId = data.length ? Number(data[0].id) : null;
            reset();
        } catch {
            els.select.innerHTML = '<option value="">Could not load customers</option>';
        }
    }

    function toggle(force) {
        state.open = typeof force === 'boolean' ? force : !state.open;
        els.panel.hidden = !state.open;
        els.launcher.setAttribute('aria-expanded', String(state.open));
        if (state.open) els.input.focus();
    }

    function reset() {
        state.conversationId = null;
        els.messages.innerHTML = '';
        const name = els.select.selectedOptions[0] ? els.select.selectedOptions[0].textContent.replace(/\s*\(#\d+\)$/, '') : 'there';
        addMessage('bot', `Hi ${name}! I can help with your balances, recent transactions, loans and EMIs, and credit cards.`);
        els.suggestions.hidden = false;
    }

    function addMessage(kind, text, toolCalls) {
        const wrap = document.createElement('div');
        wrap.className = `fa-msg ${kind}`;
        wrap.setAttribute('data-testid', kind === 'user' ? 'assistant-msg-user' : kind === 'error' ? 'assistant-msg-error' : 'assistant-msg-bot');
        wrap.innerHTML = `<div class="fa-msg-body">${format(text)}</div>`;
        if (state.showTools && toolCalls && toolCalls.length) {
            const tools = document.createElement('div');
            tools.className = 'fa-tools';
            tools.setAttribute('data-testid', 'assistant-tool-calls');
            tools.innerHTML = toolCalls.map(t => `<span class="fa-tool">${escapeHtml(t.name)}</span>`).join('');
            wrap.appendChild(tools);
        }
        els.messages.appendChild(wrap);
        els.messages.scrollTop = els.messages.scrollHeight;
    }

    async function send(text) {
        text = String(text || '').trim();
        if (!text || state.busy) return;
        if (!state.customerId) { addMessage('error', 'Please select a customer first.'); return; }

        state.busy = true;
        els.send.disabled = true;
        els.input.value = '';
        els.suggestions.hidden = true;
        addMessage('user', text);

        const typing = document.createElement('div');
        typing.className = 'fa-typing';
        typing.setAttribute('data-testid', 'assistant-typing');
        typing.textContent = 'Assistant is typing…';
        els.messages.appendChild(typing);
        els.messages.scrollTop = els.messages.scrollHeight;

        try {
            const res = await http(`${API}/chat`, {
                method: 'POST',
                body: JSON.stringify({ customerId: state.customerId, conversationId: state.conversationId, message: text }),
            });
            const body = await res.json().catch(() => ({}));
            if (res.ok) {
                state.conversationId = body.conversationId;
                addMessage('bot', body.reply, body.meta && body.meta.toolCalls);
            } else if (res.status === 503) {
                addMessage('error', 'The assistant has been turned off. Please try again later.');
                setTimeout(() => refreshVisibility(), 1500);
            } else if (body.code === 'conversation_expired') {
                state.conversationId = null;
                addMessage('error', 'That conversation expired. Please send your message again.');
            } else {
                addMessage('error', body.error || 'Something went wrong. Please try again.');
            }
        } catch {
            addMessage('error', 'Cannot reach the server. Please check your connection.');
        } finally {
            typing.remove();
            state.busy = false;
            els.send.disabled = false;
            els.input.focus();
        }
    }

    async function getStatus() {
        try {
            const res = await http(`${API}/status`);
            return res.ok ? await res.json() : null;
        } catch { return null; }
    }

    async function refreshVisibility() {
        const status = await getStatus();
        if (!status || !status.enabled) {
            if (els.launcher) { els.launcher.remove(); els.panel.remove(); els = {}; state.open = false; }
            return status;
        }
        if (!els.launcher) { build(); loadCustomers(); }
        return status;
    }

    async function init() {
        addCss();
        const status = await refreshVisibility();
        if (status && status.masterSwitch) addSettingsNav();
    }

    window.FinCoreAssistant = { refresh: refreshVisibility };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
