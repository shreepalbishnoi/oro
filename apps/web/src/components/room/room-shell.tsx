"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { MessageCircleQuestion, Newspaper, ScanEye, Settings, Wallet } from "lucide-react";
import { Wordmark } from "@/components/brand/oro-mark";
import { AS_OF } from "@/lib/fixtures/room";
import { inr, netWorth } from "@/lib/room/compute";
import { useApi, type SummaryOut } from "@/lib/room/live";
import { AccountMenu } from "./live/account-menu";
import { useRoomMode } from "./live/mode";
import { RoomProvider } from "./room-context";
import { ThemeToggle } from "@/components/site/theme-toggle";

/** Five tabs. Red flags and rumours are filters on News; the what-if slider lives in X-ray. */
const NAV = [
  { href: "/room", label: "News", icon: Newspaper, paths: ["/room/flags", "/room/rumours", "/room/story", "/room/calendar"] },
  { href: "/room/holdings", label: "Holdings", icon: Wallet, paths: [] },
  { href: "/room/xray", label: "X-ray", icon: ScanEye, paths: ["/room/shock"] },
  { href: "/room/ask", label: "Ask", icon: MessageCircleQuestion, paths: [] },
  { href: "/settings/alerts", label: "Settings", icon: Settings, paths: ["/settings", "/room/family"] },
];

function isActive(pathname: string, n: (typeof NAV)[number]) {
  return pathname === n.href || (n.href !== "/room" && pathname.startsWith(n.href)) || n.paths.some((p) => pathname.startsWith(p));
}

const FILTERS = [
  { href: "/room", label: "All news" },
  { href: "/room/flags", label: "Red flags" },
  { href: "/room/rumours", label: "Rumours" },
];

/** All / Red flags / Rumours, shown above the News views. */
function NewsFilters() {
  const pathname = usePathname();
  if (!FILTERS.some((f) => f.href === pathname)) return null;
  return (
    <nav aria-label="Filter news" className="mb-6 flex gap-2">
      {FILTERS.map((f) => {
        const on = pathname === f.href;
        return (
          <Link
            key={f.href}
            href={f.href}
            aria-current={on ? "page" : undefined}
            className={`rounded-full border px-3.5 py-1.5 text-[0.88rem] transition-colors ${on ? "border-paper bg-paper text-ink" : "border-line text-paper-dim hover:border-line-strong hover:text-paper"}`}
          >
            {f.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The lens opens into the strongroom: once a day, on first entry. */
function RoomDoor() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const today = new Date().toDateString();
    let seen = "";
    try {
      seen = localStorage.getItem("oro.door") ?? "";
      localStorage.setItem("oro.door", today);
    } catch {
      /* ignore */
    }
    if (seen === today || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const a = requestAnimationFrame(() => setShow(true));
    const t = window.setTimeout(() => setShow(false), 1700);
    return () => {
      cancelAnimationFrame(a);
      window.clearTimeout(t);
    };
  }, []);
  if (!show) return null;
  return (
    <div aria-hidden="true" className="room-door pointer-events-none fixed inset-0 z-[90] grid place-items-center">
      <span className="room-door-lens" />
    </div>
  );
}

function TopTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Room" className="hidden border-b border-line md:block">
      <ul className="mx-auto flex max-w-5xl gap-1 px-4 sm:px-6">
        {NAV.map((n) => {
          const on = isActive(pathname, n);
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={`relative flex items-center gap-2 px-3.5 py-3 text-[0.95rem] transition-colors ${on ? "text-paper" : "text-paper-dim hover:text-paper"}`}
              >
                <n.icon className={`size-4.5 ${on ? "text-gold" : ""}`} aria-hidden="true" />
                {n.label}
                {on && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gold" aria-hidden="true" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

function LiveNetWorth() {
  const s = useApi<SummaryOut>("/room/summary");
  if (!s.data) return null;
  return (
    <p className="hidden text-right leading-tight lg:block">
      <span className="display block text-[1.15rem] tabular">{inr(s.data.netWorthInr, { compact: true })}</span>
      <span className="block text-[0.72rem] text-mute">{s.data.asOf ? `${day(s.data.asOf)} close` : "last close"}</span>
    </p>
  );
}

function NetWorth() {
  const mode = useRoomMode();
  if (mode === "pending") return null;
  if (mode === "live") return <LiveNetWorth />;
  return (
    <p className="hidden text-right leading-tight lg:block">
      <span className="display block text-[1.15rem] tabular">{inr(netWorth, { compact: true })}</span>
      <span className="block text-[0.72rem] text-mute">{AS_OF} close</span>
    </p>
  );
}

function ModeBadge() {
  const mode = useRoomMode();
  if (mode === "pending") return null;
  return mode === "live" ? (
    <span className="hidden rounded-full border border-green/40 bg-green/10 px-2.5 py-1 text-[0.78rem] text-green sm:inline">Private to you</span>
  ) : (
    <Link href="/login?next=/room" className="hidden rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[0.78rem] text-gold hover:bg-gold/20 sm:inline">
      Demo portfolio · sign in to add yours
    </Link>
  );
}

function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Room" className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <ul className="grid grid-cols-5">
        {NAV.map((n) => {
          const on = isActive(pathname, n);
          return (
            <li key={n.href}>
              <Link href={n.href} aria-current={on ? "page" : undefined} className={`flex flex-col items-center gap-1 py-2.5 text-[0.72rem] ${on ? "text-gold" : "text-paper-dim"}`}>
                <n.icon className="size-5" aria-hidden="true" />
                {n.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function RoomShell({ children }: { children: ReactNode }) {
  return (
    <RoomProvider>
      <RoomDoor />
      <div data-chapter="vault" className="min-h-dvh pb-24 md:pb-12">
        <header className="sticky top-0 z-40 bg-ink/80 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
            <div className="flex items-center gap-4">
              <Link href="/" aria-label="ORO home">
                <Wordmark />
              </Link>
              <ModeBadge />
            </div>
            <div className="flex items-center gap-3">
              <NetWorth />
              <ThemeToggle />
              <Link href="/parakh" className="btn btn-gold h-10 px-4 text-sm">
                Check a tip
              </Link>
              <AccountMenu />
            </div>
          </div>
          <TopTabs />
        </header>
        <main id="main" className="mx-auto max-w-5xl min-w-0 px-4 pt-8 sm:px-6">
          <NewsFilters />
          {children}
        </main>
        <BottomTabs />
      </div>
    </RoomProvider>
  );
}
