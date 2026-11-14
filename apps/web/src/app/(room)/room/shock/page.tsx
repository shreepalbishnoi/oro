import { redirect } from "next/navigation";

/** The what-if slider now lives at the bottom of X-ray. */
export default function ShockPage() {
  redirect("/room/xray#what-if");
}
