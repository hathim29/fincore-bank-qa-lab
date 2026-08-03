## 🎯 QA Challenge List

FinCore Bank is designed as a practice target. Here are challenges for QA engineers at different levels — try to find and test these scenarios:

---

### 🟢 Beginner Challenges

1. **Login validation** — What happens when you submit the login form with an empty username? Does the error message appear correctly? What about just spaces in the username field?

2. **Customer search** — Search for a customer that doesn't exist. Does the UI show a "no results" message? What happens when you clear the search?

3. **Pagination** — Navigate to the last page of customers. What happens when you click "Next" on the last page? Is the button disabled?

4. **Form validation** — Try creating a new loan without filling in all required fields. Which fields are validated client-side vs server-side?

5. **Date filter** — Click the "Transactions Today" widget on the dashboard. Does it correctly filter to only today's transactions?

---

### 🟡 Intermediate Challenges

6. **PAN card format** — On the customer onboarding page, enter an invalid PAN like `ABC12345Z`. What validation fires? Try `ABCDE123F` (9 chars). Try `abcde1234f` (lowercase). Does the format check work correctly?

7. **Aadhaar validation** — Enter 11 digits in the Aadhaar field. Enter 13 digits. Enter letters. Does the Next button behaviour change as expected?

8. **EMI payment order** — Open any active loan. Can you pay EMI #3 before paying EMI #1 and #2? The system should only allow the next sequential EMI.

9. **Account freeze audit** — Freeze an account and check the audit trail in the popup. Does the reason you entered appear? Does the timestamp look correct?

10. **Credit card payment** — Pay the minimum due on a card. After payment, does the due date badge disappear? What happens if you try to pay minimum due again immediately after?

---

### 🔴 Advanced Challenges

11. **API vs UI RBAC** — Log in as a viewer. The UI hides the "Add Customer" button. Now call `POST /api/customers` directly via Postman without any auth header. Does the API accept the request? This is an intentional known limitation — write a test that documents this gap.

12. **Session elevation** — Open browser DevTools → Application → Session Storage. Change `role` from `viewer` to `admin` and refresh the page. Do admin buttons appear? Now try changing it after the page has already loaded (without refresh). Does it still work? Why or why not?

13. **Concurrent EMI payments** — Use Postman to fire two simultaneous `POST /api/loan-repayments` requests for the same loan and EMI number. Does the system handle it gracefully or create duplicate payments?

14. **Account search edge cases** — In the accounts page search, type a single character. Does the dropdown appear? Type exactly 2 characters. Type a special character like `%`. Does the API handle it safely?

15. **Dashboard widget accuracy** — Compare the "Frozen Accounts" count on the dashboard with the count you get by filtering accounts to "frozen" status. Do they match? What about after freezing a new account?

---

### 🔵 API Testing Challenges

16. **Reset endpoint** — Call `POST /api/test/reset` and verify the counts on the dashboard change back to seed values. Write a Postman test that calls reset, then asserts specific counts.

17. **Pagination consistency** — Call `GET /api/transactions?page=1&limit=5` and `GET /api/transactions?page=2&limit=5`. Are there any duplicate transaction IDs across pages? Is the total count consistent?

18. **Date filter accuracy** — Call `GET /api/transactions?date=2026-07-31`. Do all returned transactions have `created_at` on that exact date? Write a Postman test that asserts this.

19. **Invalid account number** — Call `POST /api/transactions` with a non-existent `account_id`. What HTTP status code do you get? Is the error message descriptive?

20. **Loan score calculation** — Pay 3 consecutive EMIs on time for a loan. Check the loan score via `GET /api/loans/:id`. Does `on_time_payments` increment correctly? Pay one EMI with a delayed date — does `delayed_payments` increment?

---

### 💡 Automation Challenge

Write a complete Playwright E2E test that:
1. Navigates to the onboarding page
2. Fills in all personal details
3. Enters a valid PAN and Aadhaar
4. Selects a savings account with ₹5,000 initial deposit
5. Reviews and submits
6. Asserts the success screen shows a valid account number
7. Navigates to accounts page and verifies the new account appears

---

*Found a bug not listed here? Open an issue on the GitHub repository!*
