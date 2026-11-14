import { API_URL, apiHeaders } from "@/lib/server/api";
import { currentUser } from "@/lib/server/auth";

/**
 * BFF proxy: /api/v1/* → FastAPI /v1/* with the signed-in user's short-lived token.
 * Bodies and responses are streamed, so uploads (CAS/CSV) and SSE pass straight through.
 * Admin and bot routes are not reachable from the browser through this path.
 */
const BLOCKED = /^(bots|admin)(\/|$)/;
const PASS_REQ = ["content-type", "last-event-id", "accept"];
const PASS_RES = ["content-type", "cache-control", "content-disposition", "retry-after", "x-request-id", "server-timing"];

async function proxy(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const sub = path.map(encodeURIComponent).join("/");
  if (BLOCKED.test(sub)) return Response.json({ title: "Not found" }, { status: 404 });

  const user = await currentUser();
  const h = await apiHeaders(user, req.headers);
  for (const k of PASS_REQ) {
    const v = req.headers.get(k);
    if (v) h.set(k, v);
  }
  const url = `${API_URL}/v1/${sub}${new URL(req.url).search}`;
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  let res: Response;
  try {
    res = await fetch(url, {
      method: req.method,
      headers: h,
      body: hasBody ? req.body : undefined,
      // @ts-expect-error Node fetch needs duplex for streamed request bodies
      duplex: hasBody ? "half" : undefined,
      signal: req.signal,
      cache: "no-store",
    });
  } catch {
    return Response.json({ title: "ORO is briefly unavailable", detail: "Try again in a minute." }, { status: 503 });
  }
  const out = new Headers();
  for (const k of PASS_RES) {
    const v = res.headers.get(k);
    if (v) out.set(k, v);
  }
  if (res.headers.get("content-type")?.includes("text/event-stream")) {
    out.set("Cache-Control", "no-cache, no-transform");
    out.set("X-Accel-Buffering", "no");
  }
  return new Response(res.body, { status: res.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
