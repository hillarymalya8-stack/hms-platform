# Live API Deployment

This project is ready to run the HMS backend as a hosted Node API with Postgres.

## Recommended Simple Setup

Use Railway for the API and Postgres, then keep Netlify for the web app.

## API Service

Deploy this repository/folder as the API service.

Build command:

```bash
npm ci && npm run build:api
```

Start command:

```bash
npm run start:api
```

Health check path:

```text
/api/health
```

## Required API Variables

```text
DATABASE_URL=postgresql://...
JWT_SECRET=long-random-secret
JWT_EXPIRES_IN=8h
WEB_ORIGIN=https://your-web-site.netlify.app
```

Most hosts set `PORT` automatically. The API now supports both `PORT` and `API_PORT`.

## Database

The API start command runs production migrations with:

```bash
npm run db:deploy -w @hms/api
```

Run the seed once after the database is created:

```bash
npm run db:seed -w @hms/api
```

Do not run seed on every deploy unless you intentionally want to refresh default data.

## Web App Variables

Set these in Netlify for the web app:

```text
NEXT_PUBLIC_API_URL=https://your-api-domain.com/api
NEXT_PUBLIC_ENABLE_DEMO_AUTH=false
```

After this, demo login will be disabled and the system will use the live API/database.
