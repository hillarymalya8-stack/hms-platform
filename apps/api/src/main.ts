import { createApiApp } from "./create-app";

async function bootstrap() {
  const { app, config } = await createApiApp();
  const port = Number(config.get("PORT") ?? config.get("API_PORT") ?? 4000);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
