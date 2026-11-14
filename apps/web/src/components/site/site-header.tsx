"use client";

import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { Wordmark } from "@/components/brand/oro-mark";

const NAV = [
  { href: "/parakh", label: "Parakh", note: "Check a tip" },
  { href: "/room-info", label: "Room", note: "News about what you own" },
  { href: "/play", label: "Scam quiz", note: "Five forwards, two minutes" },
  { href: "/methodology", label: "How it works", note: "Rules and the Karat score" },
];

export function SiteHeader() {
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const last = useRef(0);
  const pathname = usePathname();
  const open = openFor === pathname;

  useEffect(() => {
    const on = () => {
      const y = window.scrollY;
      setScrolled(y > 24);
      setHidden((h) => (y > 240 && y > last.current + 4 ? true : y < last.current - 4 ? false : h));
      last.current = y;
    };
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 transition-transform duration-500 ease-[var(--ease-out)]"
      style={{ transform: hidden && !open ? "translateY(-110%)" : "none" }}
    >
      <div className={`frame flex h-[4.25rem] items-center justify-between gap-4 transition-all duration-500 ${scrolled ? "mt-2" : "mt-3"}`}>
        <div className={`flex w-full items-center justify-between gap-4 rounded-full py-2 pr-2 pl-4 transition-all duration-500 ${scrolled ? "glass" : "border border-transparent"}`}>
          <Link href="/" aria-label="ORO home" className="shrink-0">
            <Wordmark />
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => {
              const active = pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-3.5 py-2 text-[0.9rem] transition-colors ${active ? "bg-paper/8 text-paper" : "text-paper-dim hover:text-paper"}`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/room" className="hidden rounded-full px-3.5 py-2 text-[0.9rem] text-paper-dim transition-colors hover:text-paper lg:inline-flex">
              Demo portfolio
            </Link>
            <ThemeToggle />
            <Link href="/parakh" className="btn btn-gold h-10 px-4 text-[0.88rem]">
              Check a tip
            </Link>
            <button
              type="button"
              className="grid size-10 place-items-center rounded-full border border-line text-paper md:hidden"
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpenFor(open ? null : pathname)}
            >
              {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="frame mt-2 md:hidden">
          <ul className="glass rounded-3xl p-2">
            {[...NAV, { href: "/room", label: "Demo portfolio", note: "Room with sample holdings" }].map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="flex items-baseline justify-between rounded-2xl px-4 py-3.5 hover:bg-paper/5">
                  <span className="display text-2xl">{n.label}</span>
                  <span className="text-sm text-mute">{n.note}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
