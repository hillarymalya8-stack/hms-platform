# Netlify Deployment

The whole system runs on Netlify:

- The web dashboard, POS terminal, prep monitor, and login UI are the Next.js app in `apps/web`.
- The NestJS API in `apps/api` runs as a Netlify Function (`netlify/functions/api.mjs`) and answers every `/api/*` request on the same site.
- Data is stored in Netlify Database (managed Postgres). Each deploy gets its connection through `NETLIFY_DB_URL`; deploy previews use their own database branch, production uses the production database.
- Database migrations live in `netlify/database/migrations` and are applied by Netlify during deploy. Keep `apps/api/prisma/migrations` in step with them (same folder name and SQL) so local Prisma workflows match.

No separate API server, database host, or Redis is needed.

## Build

`netlify.toml` sets:

- Build command: `npm run build:netlify` (builds `@hms/shared`, generates the Prisma client and compiles the API with `tsc`, then builds the web app)
- Publish directory: `apps/web/.next`
- Functions directory: `netlify/functions`; the `api` function is bundled with `nft` so Nest's decorator metadata and the Prisma query engine (`rhel-openssl-3.0.x`) are shipped intact.

## First run

A new database has no hotel and no staff accounts. Open the site and the login page shows **Set up your hotel**:

1. Enter the hotel name, currency, and the first administrator's name, email and password.
2. Setup creates the hotel, Main/Bar/Restaurant stores, Bar and Restaurant POS outlets with terminals, Food and Drinks menu categories, the chart of accounts, today's business date and the current financial period, every access level, and the Super Administrator account, then signs that administrator in.
3. Setup can only run once; afterwards the page shows the normal staff login.

Then, from Administration: add staff accounts, rooms and room types, and the POS menu with prices. From Inventory: add materials and receive opening stock.

To stop anyone else from claiming a fresh deployment before you do, set `HMS_SETUP_KEY` in the Netlify environment variables; setup will then ask for that key.

## Environment variables

None are required. Optional:

```bash
HMS_SETUP_KEY=one-time-key-for-first-run-setup
JWT_SECRET=at-least-32-random-characters   # otherwise a random secret is generated and stored in the database
JWT_EXPIRES_IN=8h
NEXT_PUBLIC_API_URL=https://other-host.example.com/api   # only to point the web app at an API hosted elsewhere
```

`NEXT_PUBLIC_ENABLE_DEMO_AUTH` and `NEXT_PUBLIC_DEMO_PASSWORD` are no longer used; demo sign-in has been removed.

## Local development

```bash
docker compose up -d            # local Postgres
npm run db:migrate              # apply Prisma migrations locally
npm run db:seed                 # optional sample data for development only
npm run dev:api                 # http://localhost:4000/api
NEXT_PUBLIC_API_URL=http://localhost:4000/api npm run dev:web
```

## Permission Levels

Access levels are created from `packages/shared/src/access-levels.ts` during first-run setup.

- Level 100: Super Administrator
- Level 80: General Manager
- Level 70: Accountant
- Level 60: Operations Supervisor
- Level 50: Front Office
- Level 40: POS Cashier
- Level 35: Storekeeper
- Level 20: Report Viewer

## Domain

The site runs on the Netlify subdomain. After adding a custom domain in Netlify, nothing else needs to change because the API is served from the same site.
