import type { Metadata } from "next";
import { Users } from "lucide-react";
import { FamilyGuardian } from "@/components/room/family-guardian";
import { RoomTitle } from "@/components/room/room-title";
import { RoomSwitch } from "@/components/room/live/mode";
import { LiveSoon } from "@/components/room/live/live-misc";

export const metadata: Metadata = { title: "Family" };

function DemoFamilyPage() {
  return (
    <>
      <RoomTitle icon={Users} eyebrow="Family rooms" title={<>Keep an eye out for the people you love.</>} lede="Combine family portfolios into one read-only view, with each person's separate consent." />
      <FamilyGuardian />
    </>
  );
}

export default function FamilyPage() {
  return <RoomSwitch demo={<DemoFamilyPage />} live={<LiveSoon what="family" />} />;
}
