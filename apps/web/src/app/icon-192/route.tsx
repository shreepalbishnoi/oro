import { markImage } from "@/lib/mark-image";

export function GET() {
  return markImage(192, 0.18);
}
