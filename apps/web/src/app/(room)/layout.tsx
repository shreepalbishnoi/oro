import type { Metadata } from "next";
import { RoomShell } from "@/components/room/room-shell";

export const metadata: Metadata = { robots: { index: false } };

export default function RoomLayout({ children }: LayoutProps<"/">) {
  return <RoomShell>{children}</RoomShell>;
}
