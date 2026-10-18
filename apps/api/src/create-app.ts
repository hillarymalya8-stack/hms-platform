import "reflect-metadata";
import helmet from "helmet";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

export type CreateApiAppOptions = {
  // Running inside a Netlify Function: requests arrive through a local proxy and connections must stay few.
  serverless?: boolean;
};

export async function createApiApp(options: CreateApiAppOptions = {}) {
  configureDatabaseUrl(options);
  const { AppModule } = await import("./app.module");
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: options.serverless ? ["error", "warn"] : undefined
  });
  const config = app.get(ConfigService);

  if (options.serverless) {
    // The function proxy forwards the visitor's address in X-Forwarded-For.
    app.set("trust proxy", "loopback");
  }

  app.setGlobalPrefix("api");
  app.use(helmet());

  const webOrigin = config.get<string>("WEB_ORIGIN");
  const allowedOrigins = webOrigin
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins?.length ? allowedOrigins : true,
    credentials: true
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  return { app, config };
}

function configureDatabaseUrl(options: CreateApiAppOptions) {
  // Netlify Database provides NETLIFY_DB_URL per deploy (production or the preview branch); it wins when present.
  const netlifyDatabaseUrl = process.env.NETLIFY_DB_URL || process.env.NETLIFY_DATABASE_URL;
  const databaseUrl = netlifyDatabaseUrl || process.env.DATABASE_URL;
  if (!databaseUrl) return;

  process.env.DATABASE_URL = options.serverless ? withServerlessPoolSettings(databaseUrl) : databaseUrl;
}

function withServerlessPoolSettings(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);
    if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "3");
    if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "20");
    if (!url.searchParams.has("connect_timeout")) url.searchParams.set("connect_timeout", "15");
    // Pooled (PgBouncer) endpoints cannot use Prisma's prepared statements.
    if (url.hostname.includes("-pooler") && !url.searchParams.has("pgbouncer")) url.searchParams.set("pgbouncer", "true");
    return url.toString();
  } catch {
    return databaseUrl;
  }
}
