import { hallmarkCard } from "@/lib/hallmark-card";

/** GET /api/hallmark/[slug] — downloadable hallmark card (same image as the verdict's OG card). */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const res = await hallmarkCard(slug);
  res.headers.set("Content-Disposition", `inline; filename="oro-hallmark.png"`);
  return res;
}
