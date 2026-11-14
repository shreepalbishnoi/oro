"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { XraySankey } from "./xray-sankey";

/** Sankey that opens focused on ?focus=SYMBOL (deep links from story cards). */
export function XrayView() {
  const params = useSearchParams();
  const router = useRouter();
  const focus = params.get("focus") ?? undefined;
  return <XraySankey height={620} highlight={focus} onPick={(s) => router.push(`/s/${s}`)} />;
}
