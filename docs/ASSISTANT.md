# FinCore Assistant — AI chatbot and LLM testing

FinCore Assistant is an LLM-powered customer support chatbot built into FinCore Bank. It answers a customer's questions about their own balances, transactions, loans (including paid and missed EMIs) and credit cards. After explicit confirmation it can also **block a card**, **pay missed EMIs** and **foreclose a loan**. The suggestion chips under the chat change with the conversation.

It exists to practise **testing AI features**: response accuracy, hallucination, prompt injection, data leakage, conversational workflows and AI regression testing.

---

## How it works

```
Chat widget ──► POST /api/assistant/chat ──► feature flag check (503 if off)
                                          ──► conversation engine (server-side history)
                                          ──► provider: Claude (Haiku)  or  mock
                                                  │ tool calls
                                                  ▼
                                   customer-scoped tools ──► PostgreSQL
```

| Piece | File |
|---|---|
| Feature flag + status | `services/assistant/status.js`, `store.js` |
| Conversation engine | `services/assistant/engine.js` |
| Tools (the only data access) | `services/assistant/tools.js` |
| Contextual suggestion chips | `services/assistant/suggestions.js` |
| EMI schedule + EMI payment (shared with the Loans page) | `services/loans/schedule.js`, `services/loans/payEmi.js` |
| System prompt | `services/assistant/systemPrompt.js` |
| Providers | `services/assistant/providers/anthropic.js`, `mock.js` |
| API routes | `routes/assistant.js` |
| Chat widget | `public/js/assistant.js`, `public/css/assistant.css` |
| Admin settings page | `public/assistant-settings.html` |

### Security design

- **Tools are bound to the customer on the server.** The model never passes a customer id, so no prompt can make it read another customer's data.
- **The server owns the conversation history.** Clients send only their new message and a `conversationId`, so they can't inject fake assistant turns or tool results.
- **A conversation is locked to one customer.** Reusing it for another customer returns `409`.
- **Every action has two server-side guards.** Card block, EMI payment and foreclosure all start with a `request_*` tool that only records a pending action. `confirm_pending_action` works only in a later turn than the request, and only if the customer's latest message is an explicit "yes". Even if the model tries to confirm on its own, the server refuses.
- **Same logic as the app.** EMI payments go through the same service as `POST /api/loan-repayments`, and the EMI schedule (paid, missed, upcoming) matches the Loans page popup, including EMIs that have no repayment row yet.
- **Not-found and not-yours look the same.** Asking for someone else's account gets the same answer as a non-existent one, so the assistant never confirms that an account exists.

---

## Turning it on and off

The assistant runs only when **all** of these are true. The server checks them on every request:

| # | Switch | Where | Restart needed? |
|---|---|---|---|
| 1 | `ASSISTANT_ENABLED=true` | server `.env` (emergency kill switch) | Yes |
| 2 | API key set, or `ASSISTANT_PROVIDER=mock` | server `.env` | Yes |
| 3 | Runtime toggle | **AI Assistant** page in the sidebar (admins only) | No |
| 4 | Daily message limit not reached | `ASSISTANT_DAILY_LIMIT` | No (resets at midnight) |

When it's off, the widget disappears and `POST /api/assistant/chat` returns `503 { reason }`, even when called directly. `GET /api/assistant/status` shows the reason: `master_switch_off`, `no_api_key`, `runtime_flag_off` or `daily_limit_reached`.

`ASSISTANT_ENV` namespaces the runtime flag and usage counters (for example `ci`, `sit`, `local`). If CI and the live site share a database, a CI run can't switch the live assistant on or off or use up its budget.

### Enable it locally

```bash
# .env
ASSISTANT_ENABLED=true
ASSISTANT_PROVIDER=anthropic        # or "mock" for no key / no cost
ANTHROPIC_API_KEY=sk-ant-...
ASSISTANT_ENV=local
```

Restart the server, log in as `admin`, open **AI Assistant** in the sidebar and switch it on. The chat button appears bottom-right on every page. Choose a customer in **Acting as**.

### Cost

On Claude Haiku a typical chat turn costs a fraction of a US cent. The settings page shows today's tokens and estimated cost. `ASSISTANT_DAILY_LIMIT` (default 200 messages) caps spend if the public demo gets hammered.

---

## Testing

### 1. Playwright — feature flag and widget (deterministic)

`tests/specs/assistant.spec.ts` has 29 tests and runs with the **mock provider**, so results never depend on an LLM:

- **Flag:** status reason, `503` when off (direct API call), admin-only toggle (`403` for viewer), boolean validation
- **UI:** widget hidden/visible, admin-only nav link, viewer can't use the toggle, admin toggle hides the widget immediately
- **Chat:** answers from the selected customer's real accounts, tool-call chips, refuses another customer's account, card block "no" path and "yes" path (status checked in the DB through the API), new conversation, Escape to close
- **Loans and chips:** default chips, missed EMIs reported and the chips switch to loan actions, "Show my paid EMIs" chip, pay missed EMIs with the "No, cancel" chip (overdue count unchanged), foreclosure with the "Yes" chip (status checked, then restored), suggestions in the API response
- **API contract:** empty or oversized message (`400`), unknown customer (`404`), conversation reused for another customer (`409`), tool calls returned in `meta`

```bash
# .env needs ASSISTANT_ENABLED=true and ASSISTANT_PROVIDER=mock
npm run test:assistant
```

CI runs these in the normal Playwright job with the mock provider.

### 2. promptfoo — LLM evals (real model)

`evals/` holds 43 eval cases against the real model. The `history` variable makes some of them multi-turn.

| Suite | What it checks | Cases |
|---|---|---|
| `accuracy.yaml` | Balances, transactions, EMI, missed EMI, EMIs paid, due dates and available credit match the data exactly | 12 |
| `hallucination.yaml` | Says "I don't have that" instead of inventing interest rates, FDs, credit scores, policies | 6 |
| `security.yaml` | Other customer's data, fake admin, customer switching, system-prompt extraction, developer mode, fake tool output, injection mid-conversation | 8 |
| `workflows.yaml` | Context carry-over; card block, pay missed EMI and foreclosure: yes / no / states the amount first / one-message bypass / topic change / other customer's card | 13 |
| `policy.yaml` | No investment advice, no off-topic code, no loan-approval promises, calm tone. Graded by an LLM (`llm-rubric`) | 4 |

The evals use two **fixed eval customers** (`evals/fixtures/evalCustomers.js`) with known numbers: *Ananya Rao* (the customer under test, with 22 paid EMIs, 1 missed EMI and 1 coming up) and *Vikram Desai* (the "other customer" whose data must never leak). Their dates are relative to today, so the suite never goes stale, and `evals/assertions/fixtureDate.js` checks date answers in any common format. Tests that change data recreate them first.

```bash
# server running with ASSISTANT_PROVIDER=anthropic and the toggle on
npm run eval          # full suite (needs ANTHROPIC_API_KEY for the grader too)
npm run eval:ci       # deterministic subset, no LLM grader
npm run eval:view     # open the promptfoo results viewer
```

**AI regression testing:** re-run the suite after any change to the system prompt, tools or model, and compare pass rates. GitHub Actions → **LLM Evals — FinCore Assistant** runs it on demand and uploads an HTML report. It needs the `ANTHROPIC_API_KEY` repository secret.

#### Baseline: the mock provider

The deterministic subset scores **35/39 (90%)** against the keyword-matching mock. The 4 failures are what you'd expect from a naive bot: it answers "what's my interest rate?" with a list of accounts, it treats "switch to customer 1" as a balance question, and so on. The suite catches all of that, which shows it can tell a real assistant apart from one that only looks plausible.

### Contextual suggestion chips

The chips under the chat are built by the **server** from what happened in each turn: which tools ran and what they returned. The model doesn't generate them, so they're deterministic, free and testable. They never offer something the customer can't do:

| After… | Chips |
|---|---|
| A loan question | Pay my missed EMIs *(only if there are missed EMIs)*, Show my paid EMIs, Foreclose my &lt;type&gt; loan, When is my next EMI? |
| A card question | Block my credit card *(only if a card is active)*, What is my minimum due?, How much credit is available? |
| Accounts / transactions | Show recent transactions, Show my loans, Show my credit cards… |
| A confirmation request | **Yes, …** / **No, cancel** |

A chip for the question the customer just asked is left out.

### Bugs found while building

- **Missed EMIs reported as "next due".** The first version only read stored repayment rows, so an EMI due in September showed up as the "next EMI". The tools now build the full schedule the same way the Loans page does.
- **Seed data inconsistency.** `db/seed.js` stores repayment rows with due dates relative to *today*, while EMIs without a row are scheduled from the loan *start date*. Some loans therefore show two EMIs due on the same date and many "missed" EMIs. The Loans page shows exactly the same thing, so the assistant agrees with the app, but the seed should be fixed.
- **Timezone shift on dates.** `pg` turns `DATE` columns into JavaScript dates at local midnight, so on a server running in IST a due date of 5 Nov serialises as `2026-11-04T18:30:00Z`, and a model reading it says "4 November". The eval for the next EMI date exposed this. The assistant's tools now return plain `YYYY-MM-DD` strings. The existing REST endpoints (for example `GET /api/credit-cards`) still return the shifted timestamps.

---

## Known limitations

- On this branch the admin check for the runtime toggle trusts a client-sent role header, the same trust model as the current login. It becomes a real check once the JWT auth layer (`feature/auth-layer`) is merged: `requireAdmin` already uses `req.user.role` when it's present.
- Conversation history is kept in server memory (30-minute expiry), so it resets when the server restarts.
- The mock provider is a test double for CI. It isn't a chatbot.
