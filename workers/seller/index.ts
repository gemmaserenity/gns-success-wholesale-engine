import { handleSellerApi, sellerJson, type SellerPortalEnv } from "./intake-handler";

function secureResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return secureResponse(await handleSellerApi(request, env));
    if (request.method !== "GET" && request.method !== "HEAD") {
      return secureResponse(sellerJson({ error: "Method not allowed" }, 405));
    }
    return secureResponse(await env.ASSETS.fetch(request));
  },
} satisfies ExportedHandler<SellerPortalEnv>;

