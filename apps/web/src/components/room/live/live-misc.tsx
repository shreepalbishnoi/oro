"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ArrowUpRight, CalendarDays, Download, Flag, MessageCircleQuestion, Radio, Send, ShieldCheck, Trash2, Users } from "lucide-react";
import { RoomTitle } from "@/components/room/room-title";
import { authClient } from "@/lib/auth-client";
import { ApiProblem, call, invalidateRoom, useApi, type FeedItem, type FeedOut, type MeOut } from "@/lib/room/live";
import { LiveStoryCard } from "./live-home";
import { LiveError, RoomSkeleton, useRoomMode } from "./mode";

/** Filings that usually matter most: governance, solvency, regulator actions (same list as the backend's HIGH_SIGNAL subset). */
const RED_FLAG = /pledge|encumb|resign|auditor|default|insolvenc|nclt|sebi order|show cause|fraud|forensic|downgrad|delay in (payment|servicing)|search and seizure|suspension/i;

export function LiveFiltered({ kind }: { kind: "flags" | "rumours" }) {
  const feed = useApi<FeedOut>("/room/feed?limit=50");
  const items = (feed.data?.items ?? []).filter((i: FeedItem) => (kind === "rumours" ? i.deniesRumour : RED_FLAG.test(i.title)));
  const meta =
    kind === "flags"
      ? { icon: Flag, eyebrow: "Red flags", title: "Red flags on companies you hold.", lede: "Promoter pledges, resignations, auditor changes, defaults, rating cuts and regulator actions, from exchange filings. Includes companies you hold through funds.", empty: "No red flags about your holdings in the last 30 days." }
      : { icon: Radio, eyebrow: "Rumours", title: "Rumours your companies answered.", lede: "When a company tells the exchange a news report or rumour is wrong, it shows up here.", empty: "No company you hold has denied a rumour recently." };
  return (
    <>
      <RoomTitle icon={meta.icon} eyebrow={meta.eyebrow} title={meta.title} lede={meta.lede} />
      {feed.error && <LiveError title={feed.error.title} detail={feed.error.detail} onRetry={feed.reload} />}
      {!feed.data && !feed.error && <RoomSkeleton rows={2} />}
      <div className="space-y-4">
        {items.map((it) => (
          <LiveStoryCard key={it.id} item={it} />
        ))}
      </div>
      {feed.data && !items.length && <p className="glass rounded-[1.5rem] p-5 text-paper-dim">{meta.empty} New filings are checked as they arrive.</p>}
    </>
  );
}

type AskOut = { answer: string; answerable: boolean; refused: boolean; mode: string; personal?: boolean; sources: { id: string; title: string; url: string | null; source: string; publishedAt: string | null }[]; remainingToday: number | null };
const SUGGEST_MINE = ["What did my companies file this week?", "How much of my money is in IT companies?", "Which business group do I have the most money in?", "Has any company I hold announced a dividend or bonus?"];
const SUGGEST_PUBLIC = ["What did HDFC Bank file this month?", "Has Infosys announced a dividend recently?", "Which companies announced a bonus issue this week?", "Did any company deny a news report this week?"];

export function LiveAsk() {
  const id = useId();
  const signedIn = useRoomMode() === "live";
  const SUGGEST = signedIn ? SUGGEST_MINE : SUGGEST_PUBLIC;
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState<{ q: string; a?: AskOut; err?: string }[]>([]);

  async function send(question: string) {
    const text = question.trim();
    if (text.length < 3 || busy) return;
    setBusy(true);
    setQ("");
    setThread((t) => [...t, { q: text }]);
    try {
      const a = await call<AskOut>("/room/ask", { method: "POST", json: { question: text } });
      setThread((t) => t.map((m, i) => (i === t.length - 1 ? { ...m, a } : m)));
    } catch (e) {
      const err = e instanceof ApiProblem ? (e.detail ?? e.title) : "Couldn't reach Ask Room.";
      setThread((t) => t.map((m, i) => (i === t.length - 1 ? { ...m, err } : m)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <RoomTitle
        icon={MessageCircleQuestion}
        eyebrow="Ask Room"
        title={signedIn ? <>Ask about your money.</> : <>Ask about any listed company.</>}
        lede={signedIn ? "Answers come from exchange filings and your own holdings, with sources. No buy or sell calls." : "Answers come from exchange filings, with sources. Sign in and add your holdings to ask about your own money."}
      />
      <div className="space-y-5" aria-live="polite">
        {thread.map((m, i) => (
          <div key={i} className="space-y-3">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-gold/15 px-4 py-2.5 text-paper">{m.q}</p>
            {!m.a && !m.err && <div className="h-20 w-3/4 animate-pulse rounded-2xl bg-ink-2" aria-label="Thinking" />}
            {m.err && <p className="rounded-2xl border border-red/40 p-4 text-paper-dim">{m.err}</p>}
            {m.a && (
              <div className={`max-w-[92%] rounded-2xl rounded-bl-md border p-4 ${m.a.refused ? "border-gold/40 bg-gold/5" : "border-line bg-ink-1/80"}`}>
                <p className="leading-relaxed whitespace-pre-line text-paper">{m.a.answer}</p>
                {m.a.sources.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-[0.8rem]">
                    {m.a.sources.map((s) => (
                      <li key={s.id} className="flex gap-2 text-paper-dim">
                        <span className="font-mono text-mute">[{s.id}]</span>
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-gold">
                            {s.source} · {s.title.slice(0, 90)} <ArrowUpRight className="size-3 shrink-0" aria-hidden="true" />
                          </a>
                        ) : (
                          <span>{s.title}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[0.75rem] text-mute">{m.a.remainingToday != null ? `${m.a.remainingToday} left today · ` : ""}not investment advice</p>
                {signedIn && m.a.personal === false && (
                  <p className="mt-2 text-[0.85rem] text-paper-dim">
                    <Link href="/room/holdings" className="text-gold underline-offset-4 hover:underline">Add your holdings</Link> to include your own money in answers.
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {thread.length === 0 && (
        <ul className="mb-5 flex flex-wrap gap-2">
          {SUGGEST.map((s) => (
            <li key={s}>
              <button type="button" onClick={() => void send(s)} className="rounded-full border border-line px-3.5 py-1.5 text-[0.85rem] text-paper-dim hover:border-gold/50 hover:text-paper">
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="glass sticky bottom-20 mt-6 flex items-end gap-2 rounded-[1.5rem] p-2 lg:bottom-6"
        onSubmit={(e) => {
          e.preventDefault();
          void send(q);
        }}
      >
        <label htmlFor={`${id}-q`} className="sr-only">
          Your question
        </label>
        <textarea
          id={`${id}-q`}
          value={q}
          onChange={(e) => setQ(e.target.value.slice(0, 500))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(q);
            }
          }}
          rows={1}
          placeholder="e.g. What did HDFC Bank file this month?"
          className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-paper placeholder:text-mute focus:outline-none"
        />
        <button disabled={busy || q.trim().length < 3} aria-label="Ask" className="btn btn-gold size-11 shrink-0 p-0">
          <Send className="size-4" aria-hidden="true" />
        </button>
      </form>
    </>
  );
}

export function LiveSoon({ what }: { what: "calendar" | "family" }) {
  const m =
    what === "calendar"
      ? { icon: CalendarDays, eyebrow: "Calendar", title: "Your dates, from filings.", body: "Board meetings, record dates, results and AGMs for the companies you hold will appear here once ORO's corporate-actions feed is switched on. Until then, those filings already show up in your feed as they're made." }
      : { icon: Users, eyebrow: "Family", title: "Family rooms are coming.", body: "You'll be able to invite family members, see combined exposure, and turn on Guardian mode to get a heads-up when a relative checks a risky tip. It needs alerts first, which are next on the build list." };
  return (
    <>
      <RoomTitle icon={m.icon} eyebrow={m.eyebrow} title={m.title} />
      <p className="glass max-w-2xl rounded-[1.5rem] p-5 text-paper-dim">{m.body}</p>
      <Link href="/room" className="btn btn-ghost mt-5 h-10 px-4 text-sm">
        Back to your feed
      </Link>
    </>
  );
}

/** Consent ledger (DPDP): withdrawing portfolio consent erases holdings on the server. */
export function LiveConsent() {
  const me = useApi<MeOut>("/me");
  const [busy, setBusy] = useState(false);
  if (me.error) return <LiveError title={me.error.title} detail={me.error.detail} onRetry={me.reload} />;
  if (!me.data) return <RoomSkeleton rows={1} />;
  const on = Boolean(me.data.consents.portfolio_analysis);
  return (
    <section className="rounded-[1.5rem] border border-line bg-ink-1/80 p-5">
      <ShieldCheck className="size-5 text-gold" aria-hidden="true" />
      <h2 className="mt-3 text-paper">Portfolio analysis</h2>
      <p className="mt-1 max-w-2xl text-[0.9rem] text-paper-dim">
        {on ? "On. ORO values your holdings, maps fund look-through and picks the news that reaches you. Turning it off erases your holdings from ORO's servers immediately." : "Off. Room has no holdings for you. Turn it on from Holdings when you import a statement."}
      </p>
      {on && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await call("/consents", { method: "POST", json: { purpose: "portfolio_analysis", granted: false } }).catch(() => undefined);
            invalidateRoom();
            me.reload();
            setBusy(false);
          }}
          className="btn btn-ghost mt-4 h-10 border-red/50 px-4 text-sm text-red hover:bg-red/10"
        >
          Withdraw consent and erase holdings
        </button>
      )}
    </section>
  );
}

export function LiveData() {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-[1.5rem] border border-line bg-ink-1/80 p-5">
        <Download className="size-5 text-gold" aria-hidden="true" />
        <h2 className="mt-3 text-paper">Export your data</h2>
        <p className="mt-1 text-[0.9rem] text-paper-dim">Everything ORO holds about you as JSON: account, consents, holdings and your check history.</p>
        <a href="/api/v1/me/export" download="oro-export.json" className="btn btn-ghost mt-4 h-10 px-4 text-sm">
          Download JSON
        </a>
      </section>
      <section className="rounded-[1.5rem] border border-red/30 bg-ink-1/80 p-5">
        <Trash2 className="size-5 text-red" aria-hidden="true" />
        <h2 className="mt-3 text-paper">Delete your account</h2>
        <p className="mt-1 text-[0.9rem] text-paper-dim">Erases your holdings, history and sign-in. This can&rsquo;t be undone.</p>
        {confirm ? (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={async () => {
                setErr(null);
                try {
                  await call("/me", { method: "DELETE" });
                  await authClient.deleteUser().catch(() => undefined);
                  await authClient.signOut().catch(() => undefined);
                  invalidateRoom();
                  router.push("/");
                  router.refresh();
                } catch (e) {
                  setErr(e instanceof ApiProblem ? (e.detail ?? e.title) : "Couldn't delete. Try again.");
                }
              }}
              className="btn h-10 bg-red px-4 text-sm text-ink hover:bg-red/90"
            >
              Yes, delete everything
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="btn btn-ghost h-10 px-4 text-sm">
              Keep my account
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className="btn btn-ghost mt-4 h-10 border-red/50 px-4 text-sm text-red hover:bg-red/10">
            Delete my account
          </button>
        )}
        {err && <p role="alert" className="mt-2 text-[0.85rem] text-red">{err}</p>}
      </section>
    </div>
  );
}
