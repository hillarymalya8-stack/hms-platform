# Simplified Inventory and Daily Usage

Inventory now opens on Stock on hand. Search by item name/code, filter by store, and optionally show stock costs.

Task buttons open one form at a time:
- Check Stock
- Receive Stock
- Issue Stock
- Transfer Stock
- Daily Usage
- Add New Item
- Stock History

Daily Usage starts closed. Clicking it loads the selected date and opens the form for section, item, quantity, purpose, and optional notes. Save daily usage records the entry and shows it in the list below. Close / Back to Stock returns to the stock screen. Form drafts remain available while moving between tasks in the same page session.

Daily Usage remains an informational log and does not deduct stock. Stock issues and POS sales handle stock deductions separately, as in the original system. The form explains this distinction to prevent double deductions. Existing outlet access restrictions still apply.

Issue and transfer have separate buttons, plain descriptions, and save actions. Stock history is available on request. Receiving and issuing reject non-numeric quantities/costs before saving, and the existing available-quantity check remains in place. Forms and task switching are disabled during saving. Usage requests are made only while Daily Usage is open, and old date requests cannot overwrite newer results.

Includes the earlier Front Office, Everyday Finance, and department-dashboard updates. No database migration is needed. Use the project's existing deployment instructions.

Validation: seven Inventory interaction checks passed with real React components and mocked API responses, covering closed-by-default forms, usage loading/saving without stock deduction, invalid usage, issue/transfer payloads, stock limits, receipt cost validation, search/store filters, and optional costs. TypeScript checking and the production web build passed. Live hotel database saving and browser visual testing were not performed.
