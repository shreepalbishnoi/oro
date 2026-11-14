import { hallmarkCard } from "@/lib/hallmark-card";

export const alt = "ORO hallmark card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return hallmarkCard(slug);
}
