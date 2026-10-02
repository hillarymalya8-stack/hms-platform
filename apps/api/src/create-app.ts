import "reflect-metadata";
import helmet from "helmet";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

export async function createApiApp() {
  configureDatabaseUrl();
  const { AppModule } = await import("./app.module");
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

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

function configureDatabaseUrl() {
  if (process.env.DATABASE_URL) return;

  const netlifyDatabaseUrl = process.env.NETLIFY_DB_URL || process.env.NETLIFY_DATABASE_URL;
  if (netlifyDatabaseUrl) {
    process.env.DATABASE_URL = netlifyDatabaseUrl;
  }
}
