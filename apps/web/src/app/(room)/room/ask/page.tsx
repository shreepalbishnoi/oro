import type { Metadata } from "next";
import { LiveAsk } from "@/components/room/live/live-misc";

export const metadata: Metadata = { title: "Ask Room" };

/** Ask works signed out too: public filings only. Signed in, it adds the reader's holdings. */
export default function AskPage() {
  return <LiveAsk />;
}
