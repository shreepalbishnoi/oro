import { markImage } from "@/lib/mark-image";

export function GET() {
  return markImage(512, 0.2);
}
