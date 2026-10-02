# HMS Platform

Integrated Hotel Management System with POS, Inventory, Purchasing, and Finance.

This repository contains the integrated hotel operations platform for front office, POS, inventory, purchasing, finance, administration, reports, and audit control.

## System Architecture

- One shared hotel database and API hold rooms, sales, payments, inventory, accounting, reports, users, and audit records.
- Accounting, administration, reporting, and management users work in the main web dashboard.
- POS runs as a separate terminal interface for cashier machines, with a different screen, smaller permission surface, and POS-only workflow.
- POS terminals and the accounting dashboard stay linked through the same API/database, so sales can post into finance without giving cashiers access to accounting screens.
- Staff enter through `/` or `/login`; the login response routes each credential to the allowed system UI.
- Role-specific local routes: `/dashboard`, `/finance`, `/front-office`, `/inventory`, `/purchasing`, `/reports`, `/administration`, `/pos`, and `/pos-terminal`.
- Staff users are registered from Administration. Admin assigns the role/access level, and that role controls which system opens after login and which modules are blocked.
- Local POS terminal route: `http://127.0.0.1:3000/pos-terminal`.
- Netlify is the production web host for the dashboard, POS terminal, prep monitor, and login UI; the API connects through `NEXT_PUBLIC_API_URL`, and production data must use hosted Postgres rather than the local Docker database.
- Access levels are seeded from shared role definitions so each user level controls what they can and cannot open.

## POS Printing and Preparation Routing

- Customer receipts print from the POS terminal through the cashier machine's installed receipt printer.
- Food orders route to the Restaurant Kitchen prep ticket queue.
- Drink orders route to the Bar Printer prep ticket queue.
- Service items route to the Service Desk prep ticket queue.
- Browser printing opens the machine print dialog. Silent direct thermal printing should be handled by a local print-agent installation on each POS machine before real deployment.

## Access Levels

- Level 100: Super Administrator.
- Level 80: General Manager.
- Level 70: Accountant.
- Level 60: Operations Supervisor.
- Level 50: Front Office.
- Level 40: POS Cashier.
- Level 35: Storekeeper.
- Level 20: Report Viewer.

See `docs/netlify-deployment.md` for Netlify deployment settings and production environment variables.

## Foundation Scope

- Organization and property model.
- Property settings for currency, fiscal year, business date, check-in, and check-out.
- User authentication foundation.
- Role-based permissions.
- Audit logging.
- Business dates.
- Chart of accounts foundation.
- Balanced journal validation.
- A management dashboard shell for the web app.

## Hotel Core Scope

- Room types.
- Floors and rooms.
- Guest profiles.
- Reservations.
- Reservation room assignment.
- Double-booking protection for overlapping confirmed, tentative, or checked-in stays.
- Check-in with automatic folio creation.
- Check-out with settled-folio enforcement and room status update.
- Front-office dashboard workspace for loading data, creating guests, creating reservations, and moving reservations through check-in/check-out.

## POS Scope

- Restaurant POS outlet, terminal, table, product, order, order item, and payment model.
- POS API for listing outlets/catalog/orders, creating orders, and taking payments.
- Payment policy enforcement for external receipt IDs on card, credit, mobile money, and bank transfer methods.
- Duplicate external receipt ID checks per property and payment method.
- Cashier workspace in the web app for adding items, calculating tax, taking payment, and showing paid receipts.
- POS payments require the API and shared database before receipts are saved.

## Inventory Scope

- Inventory control workspace for hotel stores, kitchen stores, and bar stores.
- Stock receiving with weighted average cost recalculation.
- Department issues that show the accounting impact: debit cost of sales/expense, credit inventory.
- Store-to-store transfers with no profit-and-loss impact.
- Reorder alerts based on quantity versus reorder level.
- Movement audit for receipts, issues, transfers, quantities, values, and posting logic.

## Purchasing Scope

- Purchasing and accounts payable workspace for the procure-to-pay flow.
- Purchase order creation, approval, and goods receiving.
- Supplier invoice matching against received quantities and PO values.
- Invoice variance tolerance check before posting AP.
- AP balance and paid supplier totals.
- Posting audit for PO approval, goods received not invoiced, accounts payable, and supplier payment entries.

## Finance Scope

- Finance close workspace for general ledger review and business date close.
- Pending operational journal posting from POS, front office, purchasing, and manual adjustments.
- Trial balance with debit and credit validation.
- Profit and loss for room revenue, restaurant revenue, cost of sales, and operating expenses.
- Balance sheet for assets, liabilities, equity, and retained profit.
- Close audit trail for posted journals and locked business dates.

## Reports Scope

- Management reports workspace for executive and operational reporting.
- Occupancy, ADR, RevPAR, revenue target, and revenue mix KPIs.
- AR and AP aging report with escalation flags.
- Inventory variance report comparing system quantities to counted quantities.
- Report export queue for PDF, Excel, and CSV output.
- Export audit trail for report name, date range, format, and queued time.

## Administration Scope

- Administration workspace for user access, roles, permissions, settings, and audit control.
- User invitation with role assignment.
- User suspension/reactivation and MFA enforcement controls.
- Role permission matrix across dashboard, front office, POS, inventory, purchasing, finance, reports, and administration.
- Property settings for currency, tax rate, business date, reservation numbering, and receipt numbering.
- Administration audit trail for access, settings, MFA, and permission changes.

## Offline POS Scope

- Offline POS and sync workspace for terminal connectivity and local order queues.
- Terminal status monitoring for online, offline, and syncing devices.
- Local sale queue with idempotency keys to prevent duplicate posting.
- Sync queue action for retrying queued transactions.
- Conflict resolution for duplicate external references.
- Device readiness checks for receipt printers, cash drawers, and scanners.
- Sync audit trail for terminal, queue, device, and conflict events.

## Backend Persistence Scope

- Backend persistence workspace for moving each module into saved workflows.
- Persistence readiness map covering front office, POS, inventory, purchasing, finance, reports, administration, and offline sync.
- API status endpoint for persistence coverage and remaining production checks.
- API transition endpoint now saves module readiness changes with actor context.
- Prisma schema coverage for POS, inventory, purchasing/AP, report exports, offline terminals, offline sync events, and persistence transitions.
- Migration source for the same persistence tables.
- Regenerated Prisma client and passing API/web type checks against the expanded schema.
- Clear next step: start PostgreSQL, apply migrations, seed data, and add save-and-reload endpoint tests before deeper persistence services are marked production ready.

## Local Services

Copy `.env.example` to `.env`, then start PostgreSQL and Redis:

```bash
docker compose up -d
```

Install dependencies:

```bash
npm install
```

Generate the database client and create the schema:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

Run the API:

```bash
npm run dev:api
```

Run the web app:

```bash
npm run dev:web
```

Default seeded login:

- Email: `admin@hotel.local`
- Password: `ChangeMe123!`

Default POS cashier login:

- Email: `cashier@hotel.local`
- Password: `ChangeMe123!`

Change the seeded password before any real deployment.
