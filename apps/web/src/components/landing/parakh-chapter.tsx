"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Hallmark } from "@/components/assay/hallmark";
import { Loupe } from "@/components/assay/loupe";
import { gsap, reduced, useGSAP } from "@/lib/gsap";
import { ChatFrame, type ChatApp } from "./chat-skin";
import { ChapterHead } from "./chapter-head";

type Seg = string | { t: string; note: string; tone: "red" | "gold" | "mute" };

const TIP: Seg[] = [
  "🚀 ",
  { t: "KAVERI POWER ko ₹4,200 crore ka order", note: "Filing says ₹420 cr: 10× inflated", tone: "red" },
  " mila hai, kal announcement hoga!\n",
  { t: "Operator news hai, kisi ko mat batana.", note: "Fake “insider” secrecy", tone: "gold" },
  " ",
  { t: "Target 180, SL 120.", note: "Price call from an unregistered sender", tone: "gold" },
  "\nVIP group join karo ",
  { t: "sirf ₹999 mein: pay to [UPI id]", note: "Payment to a personal UPI id", tone: "gold" },
  "\n",
  { t: "100% sure shot", note: "Promised returns: scam sign #1", tone: "red" },
  ", aaj hi lo 🔥",
];

const toneColor = { red: "var(--red)", gold: "var(--gold)", mute: "var(--paper-dim)" } as const;

/** The same forward twice: as received, and as ORO reads it (the loupe reveals the second). */
function Chat({ app, truth }: { app: ChatApp; truth?: boolean }) {
  return (
    <div className="relative">
      <ChatFrame
        app={app}
        badge={truth ? <span className="ml-1 rounded-full border border-gold/50 bg-ink/70 px-2 py-0.5 text-[0.7rem] font-medium whitespace-nowrap text-gold">Read by ORO</span> : undefined}
      >
        <p className="mt-1 text-[0.98rem] leading-[2.05] whitespace-pre-line sm:text-[1.02rem]">
          {TIP.map((s, i) =>
            typeof s === "string" ? (
              <span key={i}>{s}</span>
            ) : truth ? (
              <span key={i} className="relative rounded-sm [box-decoration-break:clone]" style={{ background: `color-mix(in oklab, ${toneColor[s.tone]} 24%, transparent)`, boxShadow: `inset 0 -2px 0 ${toneColor[s.tone]}` }}>
                {s.t}
                <span className="absolute -top-[1.1rem] left-0 rounded bg-ink px-1.5 py-0.5 text-[0.62rem] leading-none font-medium whitespace-nowrap" style={{ color: toneColor[s.tone] }}>
                  {s.note}
                </span>
              </span>
            ) : (
              <span key={i}>{s.t}</span>
            ),
          )}
        </p>
      </ChatFrame>
      {truth && (
        <div className="absolute -right-3 -bottom-10 sm:-right-8">
          <Hallmark karat={2} risk="high" size={104} animate={false} date={new Date("2026-11-07T10:42:00+05:30")} />
        </div>
      )}
    </div>
  );
}

const FEATURES = [
  {
    title: "A verdict for each claim",
    body: "Supported, Conflicting or Unverified, next to the line from the filing that decides it.",
    viz: (
      <ul className="space-y-1.5 font-mono text-[0.72rem]">
        <li className="flex justify-between gap-3 whitespace-nowrap"><span className="truncate text-paper-dim">₹4,200 cr order</span><span className="text-red">✕ Conflicting</span></li>
        <li className="flex justify-between gap-3 whitespace-nowrap"><span className="truncate text-paper-dim">State utility order</span><span className="text-green">✓ Supported</span></li>
        <li className="flex justify-between gap-3 whitespace-nowrap"><span className="truncate text-paper-dim">“100% sure shot”</span><span className="text-paper-dim">? Unverified</span></li>
      </ul>
    ),
  },
  {
    title: "How far it has spread",
    body: "How many people checked this message, or a reworded copy of it. ORO keeps a fingerprint, never the text.",
    viz: (
      <div>
        <div className="flex items-end gap-[3px]" aria-hidden="true">
          {[2, 3, 5, 4, 8, 12, 9, 15, 22, 18, 30, 26, 34, 41].map((h, i) => (
            <span key={i} className="w-full rounded-sm bg-gold/70" style={{ height: `${h}px`, opacity: 0.35 + i / 20 }} />
          ))}
        </div>
        <p className="mt-2 font-mono text-[0.72rem] text-paper-dim">Example: 214 checks, 9 versions, first seen 3 days ago</p>
      </div>
    ),
  },
  {
    title: "Who is selling",
    body: "Bulk deals, insider sales and pledges in the same stock, shown while the tip is asking you to buy.",
    viz: (
      <ul className="space-y-1.5 font-mono text-[0.72rem] text-paper-dim">
        <li className="flex justify-between"><span>6 Nov · Bulk deal</span><span className="text-paper">Sold 4,80,000</span></li>
        <li className="flex justify-between"><span>4 Nov · Insider</span><span className="text-paper">Sold 1.4%</span></li>
        <li className="text-mute">Public disclosures. Not proof of wrongdoing.</li>
      </ul>
    ),
  },
  {
    title: "A result card to send back",
    body: "Reply to the group with the card. The sources go with it, so nobody has to take your word for it.",
    viz: (
      <div className="flex items-center gap-3">
        <Hallmark karat={21} risk="low" size={64} animate={false} date={new Date("2026-11-04T16:00:00+05:30")} />
        <Hallmark karat={2} risk="high" size={64} animate={false} date={new Date("2026-11-07T10:42:00+05:30")} />
        <Hallmark karat={11} risk="elevated" size={64} animate={false} date={new Date("2026-11-06T11:05:00+05:30")} />
      </div>
    ),
  },
];

/** Parakh: the loupe over a forward, then the four things a check gives you. */
export function ParakhChapter() {
  const root = useRef<HTMLElement>(null);
  const [app, setApp] = useState<ChatApp>("whatsapp");
  useGSAP(
    () => {
      if (reduced()) return;
      gsap.from(".pk-feature", { opacity: 0, y: 50, duration: 1.1, ease: "molten", stagger: 0.1, scrollTrigger: { trigger: ".pk-features", start: "top 80%", once: true } });
      gsap.from(".pk-loupe", { opacity: 0, y: 60, rotate: -1.5, duration: 1.3, ease: "molten", scrollTrigger: { trigger: ".pk-loupe", start: "top 85%", once: true } });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="parakh" data-chapter="parakh" className="relative py-[18svh]">
      <div className="frame">
        <div className="grid items-center gap-14 lg:grid-cols-[0.9fr_1.1fr]">
          <ChapterHead
            title={
              <>
                Look at a forward <span className="display-italic text-molten">the way ORO does.</span>
              </>
            }
            lede={
              <>
                ORO removes your personal details, flags scam patterns, and checks each claim against BSE and NSE filings and SEBI records. You get a score out of 24 we call <span className="text-gold">Karat</span>: 0 means made up, 24 means every claim is in the filings.
              </>
            }
          />
          <div className="pk-loupe">
            <div role="tablist" aria-label="Chat app" className="mb-3 inline-flex rounded-full border border-line bg-ink-1/80 p-1 text-[0.85rem]">
              {(["whatsapp", "telegram"] as const).map((a) => (
                <button key={a} role="tab" type="button" aria-selected={app === a} onClick={() => setApp(a)} className={`rounded-full px-3.5 py-1.5 transition-colors ${app === a ? "bg-paper text-ink" : "text-paper-dim hover:text-paper"}`}>
                  {a === "whatsapp" ? "WhatsApp group" : "Telegram channel"}
                </button>
              ))}
            </div>
            <Loupe key={app} label="A forwarded stock tip. Move the loupe over it to see what ORO finds." surface={<Chat app={app} />} truth={<Chat app={app} truth />} />
          </div>
        </div>

        <div className="pk-features mt-28 grid gap-px overflow-hidden rounded-[2rem] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <article key={f.title} className="pk-feature flex flex-col gap-4 bg-ink/85 p-6 backdrop-blur-md">
              <h3 className="text-[1.15rem] font-medium text-paper">{f.title}</h3>
              <p className="flex-1 text-[0.92rem] leading-relaxed text-paper-dim">{f.body}</p>
              <div className="rounded-2xl border border-line bg-ink-1/80 p-4">{f.viz}</div>
            </article>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link href="/parakh" className="btn btn-gold">
            Check a tip <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link href="/methodology" className="btn btn-ghost">
            How the score works <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
