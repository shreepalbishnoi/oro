import { z } from "zod";

const Body = z.object({ slug: z.string().max(6000), what: z.string().trim().min(3).max(1000), link: z.string().url().max(500).optional().or(z.literal("")) });

// Preview store; PLAN §8 `error_reports` table replaces it.
const g = globalThis as typeof globalThis & { __oroReports?: unknown[] };

/** POST /api/report: a reader reports a wrong verdict (PLAN §9.7 POST /checks/{id}/report). */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ title: "Check the report", detail: parsed.error.issues[0]?.message }, { status: 422 });
  (g.__oroReports ??= []).push({ ...parsed.data, at: new Date().toISOString() });
  return Response.json({ ok: true }, { status: 202 });
}
