# Netlify Deployment

The production target is Netlify-first:

- Netlify hosts the web dashboard, POS terminal, prep monitor, and role-based login UI.
- The database must be hosted Postgres, not the local Docker database.
- The current safest deployment keeps the NestJS API on a Node backend runtime and points Netlify to it with `NEXT_PUBLIC_API_URL`.
- A later phase can move API routes into Netlify Functions, using the shared API bootstrap in `apps/api/src/create-app.ts`.

## Netlify Site

The included `netlify.toml` sets the Netlify web build:

- Build command: `npm run build:netlify`
- Publish directory: `apps/web/.next`
- Node version: `20`
- Next skew protection: `NETLIFY_NEXT_SKEW_PROTECTION=true`
- Browser security headers for all routes

Add these environment variables in Netlify:

```bash
NEXT_PUBLIC_ENABLE_DEMO_AUTH=true
NEXT_PUBLIC_API_URL=https://your-api-host.example.com/api
NEXT_TELEMETRY_DISABLED=1
NETLIFY_NEXT_SKEW_PROTECTION=true
```

For a web-only Netlify demo, keep `NEXT_PUBLIC_ENABLE_DEMO_AUTH=true` and leave `NEXT_PUBLIC_API_URL` unset. Seeded demo users such as `admin@hotel.local` can sign in with `ChangeMe123!`, and the site will not show the backend-offline warning.

For a live hotel system, set `NEXT_PUBLIC_ENABLE_DEMO_AUTH=false`, deploy the API separately, and set `NEXT_PUBLIC_API_URL` to that API `/api` URL.

If the API is later moved into Netlify Functions on the same Netlify site, change:

```bash
NEXT_PUBLIC_API_URL=/api
```

## Database

Production must use hosted Postgres. You can use Netlify Database when the project is ready for the Netlify database workflow, or another hosted Postgres provider if you want the API deployed first with fewer code changes.

Do not use:

```bash
postgresql://hms:hms_password@localhost:5432/hms_platform?schema=public
```

That URL is only for local Docker.

## Backend API

Current deployment shape:

1. Deploy the NestJS API to a Node backend runtime.
2. Set the API production variables from `.env.production-api.example`.
3. Use the hosted Postgres `DATABASE_URL`.
4. Set `WEB_ORIGIN` to the Netlify site URL and custom domain.
5. Set Netlify `NEXT_PUBLIC_API_URL` to the API `/api` URL.

Required API variables:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB?schema=public
REDIS_URL=redis://HOST:6379
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=8h
API_PORT=4000
WEB_ORIGIN=https://your-site.netlify.app,https://yourhotel.com
```

When using Netlify Database, Netlify may expose the connection string as `NETLIFY_DB_URL`. The API accepts that too and will copy it into `DATABASE_URL` at startup if `DATABASE_URL` is missing.

## Netlify Functions Phase

Netlify Functions can host server-side API routes, and Netlify Database can provide managed Postgres. Moving the full API there is a separate phase because this system currently runs as a NestJS server with Prisma, JWT, CORS, and many modules.

Before moving the API into Netlify Functions:

- Add the Netlify function entrypoint.
- Confirm Prisma generation and migrations run in the Netlify build.
- Set production `DATABASE_URL` from Netlify Database.
- Move `/api/*` requests to the function route.
- Test login, POS orders, room charges, reports, inventory, and admin permissions in the deployed environment.

## Permission Levels

Seeded access levels are created from `packages/shared/src/access-levels.ts`.

- Level 100: Super Administrator
- Level 80: General Manager
- Level 70: Accountant
- Level 60: Operations Supervisor
- Level 50: Front Office
- Level 40: POS Cashier
- Level 35: Storekeeper
- Level 20: Report Viewer

The POS terminal defaults to the Level 40 cashier account, which can create/pay POS orders but cannot open accounting endpoints.

## Domain

You can launch first on the Netlify subdomain:

```text
https://your-site.netlify.app
```

After buying a domain, point the DNS to Netlify and add the custom domain to `WEB_ORIGIN` for the API.
