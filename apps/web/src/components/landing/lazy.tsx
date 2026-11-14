"use client";

import dynamic from "next/dynamic";
import { WhenVisible } from "@/components/motion/when-visible";

const ScamDeckLazy = dynamic(() => import("@/components/play/scam-deck").then((m) => m.ScamDeck), { ssr: false });
const SankeyLazy = dynamic(() => import("@/components/room/xray-sankey").then((m) => m.XraySankey), { ssr: false });
const ShockLazy = dynamic(() => import("@/components/room/shock-simulator").then((m) => m.ShockSimulator), { ssr: false });

/** Below-the-fold interactive pieces of the landing page, loaded on approach. */
export function LandingDeck({ ids }: { ids: string[] }) {
  return (
    <WhenVisible minHeight="31rem">
      <ScamDeckLazy ids={ids} compact />
    </WhenVisible>
  );
}

export function LandingSankey() {
  return (
    <WhenVisible minHeight="38rem">
      <SankeyLazy height={560} labelSize={18} />
    </WhenVisible>
  );
}

export function LandingShock() {
  return (
    <WhenVisible minHeight="24rem">
      <ShockLazy compact />
    </WhenVisible>
  );
}
