import { test, expect, APIRequestContext } from '@playwright/test';
import { AssistantWidget } from '../pages/AssistantWidget';

/**
 * FinCore Assistant — feature flag + chat widget tests
 *
 * Runs against the deterministic MOCK provider (ASSISTANT_PROVIDER=mock) so
 * results never depend on an LLM. LLM quality (accuracy, hallucination,
 * prompt injection) is covered separately by the promptfoo suite in /evals.
 *
 * Covers: server-enforced flag, admin-only toggle, widget visibility,
 * customer data scoping, card-block confirmation, conversation handling,
 * input validation.
 */

const ADMIN  = { username: 'admin',  role: 'admin' };
const VIEWER = { username: 'viewer', role: 'viewer' };

type Fixture = { customerId: number; customerName: string; accountNumber: string; cardId: number; cardLast4: string; otherAccountNumber: string };

async function findFixture(request: APIRequestContext): Promise<Fixture> {
    const cards = await (await request.get('/api/credit-cards?status=active&limit=50')).json();
    for (const card of cards.data) {
        const cust = await (await request.get(`/api/customers/${card.customer_id}`)).json();
        const activeCards = cust.credit_cards.filter((c: any) => c.status === 'active');
        if (cust.accounts.length && activeCards.length === 1) {
            const accounts = await (await request.get('/api/accounts?limit=100')).json();
            const other = accounts.data.find((a: any) => a.customer_id !== cust.id);
            return {
                customerId: cust.id,
                customerName: cust.name,
                accountNumber: cust.accounts[0].account_number,
                cardId: card.id,
                cardLast4: card.card_number_masked.slice(-4),
                otherAccountNumber: other.account_number,
            };
        }
    }
    throw new Error('Seed data has no customer with exactly one active card');
}

async function chat(request: APIRequestContext, data: object) {
    return request.post('/api/assistant/chat', { data });
}

test.describe.configure({ mode: 'serial' });

test.describe('FinCore Assistant', () => {
    let fx: Fixture;
    let mockMode = false;

    test.beforeAll(async ({ request }) => {
        const s = await AssistantWidget.status(request);
        mockMode = s.masterSwitch && s.provider === 'mock';
        if (mockMode) fx = await findFixture(request);
    });

    test.beforeEach(async () => {
        test.skip(!mockMode, 'Needs ASSISTANT_ENABLED=true and ASSISTANT_PROVIDER=mock in .env');
    });

    // Leave the flag OFF so no other spec ever sees the widget
    test.afterAll(async ({ request }) => {
        if (mockMode) await AssistantWidget.setFlag(request, false);
    });

    // ── Feature flag — enforced by the server ──────────────────
    test.describe('Feature flag (API)', () => {
        test.beforeEach(async ({ request }) => { await AssistantWidget.setFlag(request, false); });

        test('status reports runtime_flag_off when the toggle is off', async ({ request }) => {
            const s = await AssistantWidget.status(request);
            expect(s.enabled).toBe(false);
            expect(s.reason).toBe('runtime_flag_off');
        });

        test('chat API returns 503 when off, even when called directly', async ({ request }) => {
            const res = await chat(request, { customerId: fx.customerId, message: 'What is my balance?' });
            expect(res.status()).toBe(503);
            expect((await res.json()).reason).toBe('runtime_flag_off');
        });

        test('non-admin cannot change the flag', async ({ request }) => {
            const res = await request.put('/api/assistant/flags', {
                headers: { 'x-fincore-role': 'viewer' }, data: { enabled: true },
            });
            expect(res.status()).toBe(403);
            expect((await AssistantWidget.status(request)).runtimeFlag).toBe(false);
        });

        test('flag update rejects a non-boolean value', async ({ request }) => {
            const res = await request.put('/api/assistant/flags', {
                headers: { 'x-fincore-role': 'admin' }, data: { enabled: 'yes' },
            });
            expect(res.status()).toBe(400);
        });

        test('turning the flag on enables chat', async ({ request }) => {
            const s = await AssistantWidget.setFlag(request, true);
            expect(s.enabled).toBe(true);
            const res = await chat(request, { customerId: fx.customerId, message: 'hello' });
            expect(res.status()).toBe(200);
        });
    });

    // ── Widget visibility and admin settings ───────────────────
    test.describe('Widget and settings page', () => {
        test('widget is hidden when the flag is off', async ({ page, request }) => {
            await AssistantWidget.setFlag(request, false);
            await page.addInitScript(u => sessionStorage.setItem('fincore_user', JSON.stringify(u)), ADMIN);
            await page.goto('/dashboard.html');
            await page.waitForLoadState('networkidle');
            await expect(page.getByTestId('assistant-launcher')).toHaveCount(0);
        });

        test('widget is visible when the flag is on', async ({ page, request }) => {
            await AssistantWidget.setFlag(request, true);
            await page.addInitScript(u => sessionStorage.setItem('fincore_user', JSON.stringify(u)), VIEWER);
            await page.goto('/dashboard.html');
            await expect(page.getByTestId('assistant-launcher')).toBeVisible();
        });

        test('admin sees the AI Assistant nav link, viewer does not', async ({ browser, request }) => {
            await AssistantWidget.setFlag(request, true);
            for (const [u, count] of [[ADMIN, 1], [VIEWER, 0]] as const) {
                const ctx = await browser.newContext();
                const p = await ctx.newPage();
                await p.addInitScript(x => sessionStorage.setItem('fincore_user', JSON.stringify(x)), u);
                await p.goto('/dashboard.html');
                await expect(p.getByTestId('assistant-launcher')).toBeVisible();
                await expect(p.getByTestId('nav-assistant-settings')).toHaveCount(count);
                await ctx.close();
            }
        });

        test('viewer cannot use the toggle on the settings page', async ({ page, request }) => {
            await AssistantWidget.setFlag(request, true);
            await page.addInitScript(u => sessionStorage.setItem('fincore_user', JSON.stringify(u)), VIEWER);
            await page.goto('/assistant-settings.html');
            await expect(page.getByTestId('assistant-status-pill')).toContainText('Enabled');
            await expect(page.getByTestId('assistant-flag-toggle')).toBeDisabled();
            await expect(page.getByTestId('assistant-toggle-note')).toContainText('Only admins');
        });

        test('admin turning the toggle off hides the widget immediately', async ({ page, request }) => {
            await AssistantWidget.setFlag(request, true);
            await page.addInitScript(u => sessionStorage.setItem('fincore_user', JSON.stringify(u)), ADMIN);
            await page.goto('/assistant-settings.html');
            await expect(page.getByTestId('assistant-launcher')).toBeVisible();
            await page.locator('.fa-switch').click();
            await expect(page.getByTestId('assistant-status-pill')).toContainText('Disabled');
            await expect(page.getByTestId('assistant-status-reason')).toContainText('Turned off on this page');
            await expect(page.getByTestId('assistant-launcher')).toHaveCount(0);
            expect((await AssistantWidget.status(request)).runtimeFlag).toBe(false);
        });
    });

    // ── Chat behaviour (mock provider, real data path) ─────────
    test.describe('Chat', () => {
        let widget: AssistantWidget;

        test.beforeEach(async ({ page, request }) => {
            await AssistantWidget.setFlag(request, true);
            await page.addInitScript(u => sessionStorage.setItem('fincore_user', JSON.stringify(u)), ADMIN);
            await page.goto('/dashboard.html');
            widget = new AssistantWidget(page);
            await widget.open();
            await widget.selectCustomer(fx.customerId);
        });

        test('greets the selected customer by name', async () => {
            await expect(widget.botMessages.first()).toContainText(fx.customerName);
        });

        test('answers a balance question from the customer\'s own accounts', async () => {
            const reply = await widget.ask('What is my balance?');
            await expect(reply).toContainText(fx.accountNumber);
            await expect(reply.getByTestId('assistant-tool-calls')).toContainText('list_accounts');
        });

        test('suggestion chip sends a question', async () => {
            await widget.suggestions.filter({ hasText: 'recent transactions' }).click();
            await expect(widget.userMessages.last()).toHaveText('Show recent transactions');
            await expect(widget.lastReply().getByTestId('assistant-tool-calls')).toContainText('get_recent_transactions');
        });

        test('refuses another customer\'s account', async () => {
            const reply = await widget.ask(`What is the balance of account ${fx.otherAccountNumber}?`);
            await expect(reply).toContainText('only help with your own accounts');
            await expect(reply).not.toContainText(fx.otherAccountNumber + ':');
        });

        test('card block needs confirmation — "no" cancels and the card stays active', async ({ request }) => {
            const ask = await widget.ask(`Please block my card ${fx.cardLast4}`);
            await expect(ask).toContainText('reply "yes" to confirm');
            const no = await widget.ask('no');
            await expect(no).toContainText('cancelled');
            const card = await (await request.get(`/api/credit-cards/${fx.cardId}`)).json();
            expect(card.status ?? card.card?.status).toBe('active');
        });

        test('card block with "yes" blocks the card', async ({ request }) => {
            try {
                await widget.ask(`Block my card ${fx.cardLast4}`);
                const yes = await widget.ask('yes');
                await expect(yes).toContainText('is now blocked');
                const card = await (await request.get(`/api/credit-cards/${fx.cardId}`)).json();
                expect(card.status ?? card.card?.status).toBe('blocked');
            } finally {
                await request.put(`/api/credit-cards/${fx.cardId}/status`, { data: { status: 'active' } });
            }
        });

        test('new conversation clears the history', async ({ page }) => {
            await widget.ask('What is my balance?');
            await page.getByTestId('assistant-new-chat').click();
            await expect(widget.userMessages).toHaveCount(0);
            await expect(widget.botMessages).toHaveCount(1);
        });

        test('Escape closes the panel', async ({ page }) => {
            await page.keyboard.press('Escape');
            await expect(widget.panel).toBeHidden();
        });
    });

    // ── API contract and validation ────────────────────────────
    test.describe('Chat API validation', () => {
        test.beforeAll(async ({ request }) => { await AssistantWidget.setFlag(request, true); });

        test('rejects an empty message', async ({ request }) => {
            const res = await chat(request, { customerId: fx.customerId, message: '   ' });
            expect(res.status()).toBe(400);
        });

        test('rejects a message over 1000 characters', async ({ request }) => {
            const res = await chat(request, { customerId: fx.customerId, message: 'a'.repeat(1001) });
            expect(res.status()).toBe(400);
            expect((await res.json()).code).toBe('message_too_long');
        });

        test('returns 404 for an unknown customer', async ({ request }) => {
            const res = await chat(request, { customerId: 999999, message: 'hi' });
            expect(res.status()).toBe(404);
        });

        test('a conversation cannot be reused for a different customer', async ({ request }) => {
            const first = await (await chat(request, { customerId: fx.customerId, message: 'hi' })).json();
            const res = await chat(request, { customerId: fx.customerId + 1, conversationId: first.conversationId, message: 'What is my balance?' });
            expect(res.status()).toBe(409);
            expect((await res.json()).code).toBe('customer_mismatch');
        });

        test('response includes the tool calls used', async ({ request }) => {
            const body = await (await chat(request, { customerId: fx.customerId, message: 'show my loans' })).json();
            expect(body.meta.toolCalls.map((t: any) => t.name)).toContain('list_loans');
            expect(body.meta.provider).toBe('mock');
        });
    });
});
