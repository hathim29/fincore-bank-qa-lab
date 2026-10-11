import { Page, Locator, APIRequestContext, expect } from '@playwright/test';

/**
 * AssistantWidget — Page Object for the FinCore Assistant chat widget,
 * plus API helpers for the feature flag.
 */
export class AssistantWidget {
    readonly launcher: Locator;
    readonly panel: Locator;
    readonly input: Locator;
    readonly sendButton: Locator;
    readonly customerSelect: Locator;
    readonly botMessages: Locator;
    readonly userMessages: Locator;
    readonly errorMessages: Locator;
    readonly toolCalls: Locator;
    readonly suggestions: Locator;

    constructor(private page: Page) {
        this.launcher       = page.getByTestId('assistant-launcher');
        this.panel          = page.getByTestId('assistant-panel');
        this.input          = page.getByTestId('assistant-input');
        this.sendButton     = page.getByTestId('assistant-send');
        this.customerSelect = page.getByTestId('assistant-customer-select');
        this.botMessages    = page.getByTestId('assistant-msg-bot');
        this.userMessages   = page.getByTestId('assistant-msg-user');
        this.errorMessages  = page.getByTestId('assistant-msg-error');
        this.toolCalls      = page.getByTestId('assistant-tool-calls');
        this.suggestions    = page.getByTestId('assistant-suggestion');
    }

    async open() {
        await this.launcher.click();
        await expect(this.panel).toBeVisible();
        // customer list loaded → greeting rendered
        await expect(this.botMessages.first()).toBeVisible();
    }

    async selectCustomer(customerId: number) {
        await this.customerSelect.selectOption(String(customerId));
        await expect(this.botMessages).toHaveCount(1); // fresh greeting
    }

    /** Sends a message and returns the new bot reply locator. */
    async ask(text: string): Promise<Locator> {
        const before = await this.botMessages.count();
        await this.input.fill(text);
        await this.sendButton.click();
        await expect(this.botMessages).toHaveCount(before + 1);
        return this.botMessages.nth(before);
    }

    lastReply(): Locator {
        return this.botMessages.last();
    }

    // ── Feature flag API helpers ───────────────────────────────
    static async status(request: APIRequestContext) {
        const res = await request.get('/api/assistant/status');
        expect(res.ok()).toBeTruthy();
        return res.json();
    }

    static async setFlag(request: APIRequestContext, enabled: boolean) {
        const res = await request.put('/api/assistant/flags', {
            headers: { 'x-fincore-role': 'admin', 'x-fincore-user': 'playwright' },
            data: { enabled },
        });
        expect(res.ok()).toBeTruthy();
        return res.json();
    }
}
