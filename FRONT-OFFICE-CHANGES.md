# Front office update

Front Office opens on the room chart. Click a room to view the guest and stay actions.

- For a vacant room, choose **Assign guest / New Reservation**. The selected room is filled in automatically.
- Use **New Reservation** to add a new guest and book the stay in one form, or choose an existing guest. There is no separate New Guest form.
- Use **Check in** for a confirmed stay when the guest arrives.
- For occupied rooms, record any outstanding payment before **Check out**. Existing server settlement requirements still apply.
- **Make invoice** opens the selected reservation in the invoice workspace. **Print invoice** prepares the printable invoice. Opening a room, saving a reservation, and checking out do not automatically print or generate an invoice.
- After checkout, use **Make invoice** in the checkout confirmation, or expand **Reservations** to retrieve the stay later.
- Expand **Edit room and stay details** for housekeeping, maintenance, or existing stay changes.

Changed application files:
- apps/web/src/components/front-office-workspace.tsx
- apps/web/src/components/invoice-workspace.tsx

No database migration is needed. Use the existing project deployment process described in README.md and docs/netlify-deployment.md.

Validation: TypeScript check passed. Seven React interaction checks passed with mocked API responses, including new/existing guest reservations, retry after reservation failure without duplicating the guest, invalid dates, settlement before checkout, and selecting the intended invoice. A production web build was also run. A live hotel database was not used, so real payments, database persistence, and physical printing still need deployment testing.
