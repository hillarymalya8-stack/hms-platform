# Everyday Finance update

Finance now opens in Everyday finance. Advanced accounting remains available in a separate view.

Everyday tasks:
- Record income: choose where money was received, the income category, amount, description, and optional receipt/reference.
- Record expense: choose cash/bank/wallet, expense category, amount, description, and optional reference.
- Transfer money: move an amount between two different cash/bank/wallet accounts without recording income or an expense.
- Make guest invoice: opens the existing reservation invoice workspace on request.
- Review recent entries and approve pending entries when permitted.
- Finish this business day after pending entries have been approved.

The system prepares the balanced accounting entry automatically. Users with both entry and posting permissions can save and include it in the totals; users with entry permission only send it for approval. Existing server permission checks remain in force. Failed approval can be retried using the saved entry. Retrying an interrupted create with the same form details reuses its duplicate-prevention key.

Summary: income, costs/expenses, profit/loss, and waiting entries. Switch between the current business day and all dates. Summary dates follow approval/posting timestamps, matching the current accounting API. Balances recorded always use all approved ledger activity and are distinct from profit.

Setup: an administrator must configure appropriate cash/bank/wallet accounts and income/expense categories. Everyday forms show account names rather than codes, debits, or credits. Forms support payments already made. Unpaid bills, guest debts, and other accounting adjustments remain in Advanced accounting. All amounts use the hotel's accounting currency; this change does not introduce currency conversion.

Integration limit: Front Office and POS still do not automatically create all Finance journal entries. The simple screen explains this. Finance totals represent the accounting entries that actually exist, not a complete automatic daily reconciliation of hotel operations.

The archive includes the earlier front-office room chart, unified reservation/guest form, and separate invoice button. No database migration is needed. Follow the existing README.md and deployment documentation.

Validation: 11 Finance checks passed using real React component interactions with mocked API responses and the actual entry-mapping helper. They cover transaction direction/balancing, invalid inputs, permissions, draft approval, interrupted creation/approval retries, and summary/balance calculations. The seven earlier front-office interaction checks also passed. The production web build passed. Live hotel database operations and physical printing were not tested.
