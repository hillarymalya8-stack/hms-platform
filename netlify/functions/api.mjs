// Serves the HMS API (apps/api, compiled to apps/api/dist during the build) at /api/* on this site,
// backed by Netlify Database. The Nest app listens on a loopback port inside the function and each
// request is forwarded to it, so the API code runs exactly as it does on a standalone Node server.
import apiApp from "../../apps/api/dist/create-app.js";

const { createApiApp } = apiApp;
const hopByHopHeaders = ["connection", "keep-alive", "transfer-encoding", "content-length", "content-encoding", "host"];

let apiOrigin;

function startApi() {
  apiOrigin ??= (async () => {
    const { app } = await createApiApp({ serverless: true });
    await app.listen(0, "127.0.0.1");
    const { port } = app.getHttpServer().address();
    return `http://127.0.0.1:${port}`;
  })().catch((error) => {
    apiOrigin = undefined;
    throw error;
  });

  return apiOrigin;
}

export default async (request, context) => {
  let origin;
  try {
    origin = await startApi();
  } catch (error) {
    console.error("HMS API failed to start", error);
    return Response.json({ statusCode: 503, message: "The hotel system is starting up or the database is unavailable. Try again shortly." }, { status: 503 });
  }

  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  for (const name of hopByHopHeaders) headers.delete(name);
  if (context?.ip) headers.set("x-forwarded-for", context.ip);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const response = await fetch(`${origin}${url.pathname}${url.search}`, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: "manual"
  });

  const responseHeaders = new Headers(response.headers);
  for (const name of hopByHopHeaders) responseHeaders.delete(name);
  responseHeaders.set("cache-control", "no-store");

  return new Response(response.body, { status: response.status, headers: responseHeaders });
};

export const config = {
  path: "/api/*"
};
