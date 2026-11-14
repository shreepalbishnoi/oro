import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Settings } from "lucide-react";
import { RoomTitle } from "@/components/room/room-title";
import { AlertSettings, ConsentSettings, DataSettings } from "@/components/room/settings-panels";
import { LiveAlerts } from "@/components/room/live/live-alerts";
import { LiveConsent, LiveData } from "@/components/room/live/live-misc";
import { RoomSwitch } from "@/components/room/live/mode";

const SECTIONS = {
  alerts: { label: "Alerts", title: "When ORO may interrupt you" },
  consent: { label: "Consent", title: "What you've allowed" },
  data: { label: "Your data", title: "Take it with you, or erase it" },
} as const;
type Key = keyof typeof SECTIONS;

export function generateStaticParams() {
  return Object.keys(SECTIONS).map((section) => ({ section }));
}

export const metadata: Metadata = { title: "Settings" };

async function SettingsPageBody({ params }: Pick<PageProps<"/settings/[section]">, "params">) {
  const { section } = await params;
  if (!(section in SECTIONS)) notFound();
  const s = SECTIONS[section as Key];
  return (
    <>
      <RoomTitle icon={Settings} eyebrow="Settings" title={s.title} />
      <nav aria-label="Settings" className="mb-6 flex flex-wrap gap-2">
        {(Object.keys(SECTIONS) as Key[]).map((k) => (
          <Link key={k} href={`/settings/${k}`} aria-current={k === section ? "page" : undefined} className={`rounded-full border px-3.5 py-1.5 text-[0.88rem] ${k === section ? "border-gold bg-gold/10 text-gold" : "border-line text-paper-dim hover:text-paper"}`}>
            {SECTIONS[k].label}
          </Link>
        ))}
      </nav>
      {section === "alerts" && <RoomSwitch demo={<AlertSettings />} live={<LiveAlerts />} />}
      {section === "consent" && <RoomSwitch demo={<ConsentSettings />} live={<LiveConsent />} />}
      {section === "data" && <RoomSwitch demo={<DataSettings />} live={<LiveData />} />}
      <p className="mt-8 text-[0.78rem] text-mute">Alert preferences are kept in this browser until alerts launch. Consent and data actions apply to your ORO account.</p>
    </>
  );
}

export default function SettingsPage({ params }: PageProps<"/settings/[section]">) {
  return (
    <Suspense fallback={<div className="frame min-h-[100svh] pt-40" aria-busy="true" />}>
      <SettingsPageBody params={params} />
    </Suspense>
  );
}
