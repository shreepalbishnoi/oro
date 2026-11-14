import { z } from "zod";
import { assayStream, MAX_INPUT } from "@/lib/engine/assay";
import { encodeSlug } from "@/lib/engine/slug";
import type { InputKind } from "@/lib/engine/types";
import { API_URL, apiHeaders } from "@/lib/server/api";
import { currentUser } from "@/lib/server/auth";

const Body = z.object({
  text: z.string().trim().min(8, "Paste a little more of the message.").max(MAX_INPUT, "That's longer than a forward; trim it to 4,000 characters."),
  kind: z.enum(["text", "link", "image"]).default("text"),
  turnstileToken: z.string().max(4096).optional(),
});

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

const enc = new TextEncoder();
const frame = (ev: unknown) => enc.encode(`data: ${JSON.stringify(ev)}\n\n`);

/**
 * POST /api/checks → text/event-stream of AssayEvents.
 * Live path: FastAPI creates the check (limits, Turnstile, AI judge, records) and we relay its
 * SSE stream. If the API can't be reached, the TypeScript rules engine answers instead, and the
 * verdict says so (mode "rules-preview").
 */
export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.safeParse(await req.json());
  } catch {
    return Response.json({ title: "Bad request" }, { status: 400 });
  }
  if (!parsed.success) return Response.json({ title: "Check the input", detail: parsed.error.issues[0]?.message }, { status: 422 });
  const { text, kind, turnstileToken } = parsed.data;

  const user = await currentUser();
  const h = await apiHeaders(user, req.headers);
  h.set("Content-Type", "application/json");

  let created: Response | null = null;
  try {
    created = await fetch(`${API_URL}/v1/checks`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ text, kind, turnstileToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    created = null;
  }

  if (created && created.status < 500) {
    if (!created.ok) {
      const p = (await created.json().catch(() => ({}))) as { title?: string; detail?: string };
      return Response.json({ title: p.title ?? "The check couldn't start", detail: p.detail }, { status: created.status });
    }
    const { id } = (await created.json()) as { id: string };
    const upstream = await fetch(`${API_URL}/v1/checks/${encodeURIComponent(id)}/stream`, {
      headers: await apiHeaders(user, req.headers),
      signal: req.signal,
      cache: "no-store",
    }).catch(() => null);
    if (upstream?.ok && upstream.body) return new Response(relay(upstream.body, id), { headers: SSE_HEADERS });
  }

  return new Response(localStream(text, kind as InputKind), { headers: SSE_HEADERS });
}

/** Re-frames the API's SSE as plain `data:` events and gives the verdict a stable link (/v/c<id>). */
function relay(body: ReadableStream<Uint8Array>, id: string) {
  const dec = new TextDecoder();
  let buf = "";
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buf += dec.decode(chunk, { stream: true }).replace(/\r\n/g, "\n");
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const data = block
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).replace(/^ /, ""))
            .join("\n");
          if (!data) continue; // keep-alive comment
          try {
            const ev = JSON.parse(data) as { type: string; slug?: string | null };
            if (ev.type === "done") ev.slug = `c${id}`;
            controller.enqueue(frame(ev));
          } catch {
            /* malformed frame: skip */
          }
        }
      },
    }),
  );
}

function localStream(text: string, kind: InputKind) {
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of assayStream(text, kind, (r) => encodeSlug(r, kind))) controller.enqueue(frame(ev));
      } catch {
        controller.enqueue(frame({ type: "error", message: "The check failed. Try again." }));
      } finally {
        controller.close();
      }
    },
  });
}
