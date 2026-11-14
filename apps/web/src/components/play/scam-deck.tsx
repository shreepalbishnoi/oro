"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CircleCheck, OctagonAlert, RotateCcw, Share2, Trophy } from "lucide-react";
import { DECK, type DeckCard } from "@/lib/fixtures/scam-deck";
import { gsap, reduced, useGSAP } from "@/lib/gsap";
import { Draggable } from "gsap/Draggable";
import { InertiaPlugin } from "gsap/InertiaPlugin";
import { pulseField } from "@/lib/field-bus";
import { readLocal, writeLocal } from "@/lib/local";

gsap.registerPlugin(Draggable, InertiaPlugin);

type Answer = "scam" | "legit";
type Result = { id: string; guess: Answer; correct: boolean };

const BEST_KEY = "oro.play.best";

/** Each card wears its channel's look, so it reads like the message it imitates. */
const CHANNEL: Record<DeckCard["channel"], { bubble: string; text: string; avatar: string; corner: string }> = {
  WhatsApp: { bubble: "#202c33", text: "#e9edef", avatar: "#00a884", corner: "rounded-tl-sm" },
  Telegram: { bubble: "#182533", text: "#f5f5f5", avatar: "#5288c1", corner: "rounded-bl-sm" },
  SMS: { bubble: "#2c2c2e", text: "#f2f2f7", avatar: "#636366", corner: "rounded-bl-sm" },
  X: { bubble: "#16181c", text: "#e7e9ea", avatar: "#333639", corner: "" },
  "News app": { bubble: "var(--ink-3)", text: "var(--paper)", avatar: "var(--ink-4)", corner: "" },
  Email: { bubble: "var(--ink-3)", text: "var(--paper)", avatar: "var(--ink-4)", corner: "" },
};

function CardFace({ card }: { card: DeckCard }) {
  const c = CHANNEL[card.channel];
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white" style={{ background: c.avatar }} aria-hidden="true">
            {card.from.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "#"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[0.92rem] font-medium text-paper">{card.from}</p>
            <p className="text-[0.8rem] text-mute">{card.channel}</p>
          </div>
        </div>
      </div>
      <p className={`mt-5 flex-1 rounded-2xl ${c.corner} p-4 text-[1.02rem] leading-relaxed shadow-[0_1px_2px_rgb(0_0_0/0.3)]`} style={{ background: c.bubble, color: c.text }}>
        {card.text}
      </p>
    </div>
  );
}

/** Swipe left for Scam, right for Legit. Arrow keys and buttons do the same. */
export function ScamDeck({ ids, compact = false }: { ids?: string[]; compact?: boolean }) {
  const cards = useMemo(() => (ids ? ids.map((id) => DECK.find((d) => d.id === id)!).filter(Boolean) : DECK), [ids]);
  const [i, setI] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [revealed, setRevealed] = useState<Result | null>(null);
  const [best, setBest] = useState(0);
  const top = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const done = i >= cards.length;
  const card = cards[i];
  const score = results.filter((r) => r.correct).length;
  let streak = 0;
  for (let k = results.length - 1; k >= 0 && results[k].correct; k--) streak++;

  useEffect(() => {
    const id = requestAnimationFrame(() => setBest(readLocal<number>(`${BEST_KEY}.${compact ? "mini" : "full"}`, 0)));
    return () => cancelAnimationFrame(id);
  }, [compact]);

  const answer = useCallback(
    (guess: Answer) => {
      if (!card || revealed) return;
      const correct = guess === card.answer;
      const r = { id: card.id, guess, correct };
      setRevealed(r);
      setResults((prev) => [...prev, r]);
      pulseField(correct ? "green" : "red", 1.1);
      const el = top.current;
      if (el && !reduced()) {
        gsap.to(el, { x: guess === "scam" ? -40 : 40, rotate: guess === "scam" ? -4 : 4, duration: 0.35, ease: "power3.out" });
      }
    },
    [card, revealed],
  );

  // Verdict panel rises once it exists in the DOM.
  useEffect(() => {
    const v = top.current?.querySelector(".verdict");
    if (!revealed || !v || reduced()) return;
    gsap.fromTo(v, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.45, ease: "back.out(1.7)" });
  }, [revealed]);

  const next = useCallback(() => {
    const el = top.current;
    const go = () => {
      setRevealed(null);
      setI((n) => n + 1);
    };
    if (el && !reduced() && revealed) {
      gsap.to(el, { x: revealed.guess === "scam" ? -window.innerWidth : window.innerWidth, rotate: revealed.guess === "scam" ? -24 : 24, opacity: 0, duration: 0.5, ease: "power2.in", onComplete: go });
    } else go();
  }, [revealed]);

  useEffect(() => {
    if (!done) return;
    const key = `${BEST_KEY}.${compact ? "mini" : "full"}`;
    const prev = readLocal<number>(key, 0);
    if (score > prev) writeLocal(key, score);
    pulseField("gold", 1.4);
  }, [done, score, compact]);

  // Keyboard: ← scam, → legit, Enter/Space next. Only while the deck is in view and focused area isn't a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const r = root.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) return;
      if (e.key === "ArrowLeft" && !revealed) {
        e.preventDefault();
        answer("scam");
      } else if (e.key === "ArrowRight" && !revealed) {
        e.preventDefault();
        answer("legit");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, next, revealed]);

  // Drag to answer.
  useGSAP(
    () => {
      const el = top.current;
      if (!el || revealed || done) return;
      gsap.set(el, { x: 0, y: 0, rotate: 0, opacity: 1 });
      const [d] = Draggable.create(el, {
        type: "x,y",
        zIndexBoost: false,
        onDrag() {
          gsap.set(el, { rotate: this.x / 18 });
          el.style.setProperty("--lean", String(Math.max(-1, Math.min(1, this.x / 140))));
        },
        onRelease() {
          el.style.setProperty("--lean", "0");
          if (this.x < -110) answer("scam");
          else if (this.x > 110) answer("legit");
          else gsap.to(el, { x: 0, y: 0, rotate: 0, duration: 0.6, ease: "elastic.out(1, 0.6)" });
        },
      });
      return () => d.kill();
    },
    { dependencies: [i, revealed, done], scope: root },
  );

  const restart = () => {
    setI(0);
    setResults([]);
    setRevealed(null);
  };

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/play` : "/play";
  const shareText = `I spotted ${score}/${cards.length} stock-tip scams on ORO's Spot the Scam. Can you beat it? ${shareUrl}`;

  return (
    <div ref={root} data-deck className="relative mx-auto w-full max-w-[30rem]">
      <div className="mb-4 flex items-center justify-between text-[0.8rem] font-medium text-paper-dim">
        <span>
          Card {Math.min(i + 1, cards.length)} / {cards.length}
        </span>
        <span className="flex items-center gap-4">
          <span>
            Score <span className="text-gold">{score}</span>
          </span>
          <span>Streak {streak}</span>
          {best > 0 && <span className="hidden sm:inline">Best {best}</span>}
        </span>
      </div>

      <div className="relative h-[23rem] sm:h-[22rem]">
        {!done &&
          cards.slice(i, i + 3).map((c, k) => {
            const isTop = k === 0;
            return (
              <div
                key={c.id}
                ref={isTop ? top : undefined}
                className={`absolute inset-0 rounded-[1.75rem] border border-line bg-ink-2 p-5 ${isTop ? "cursor-grab touch-none active:cursor-grabbing" : "pointer-events-none"}`}
                style={{
                  transform: isTop ? undefined : `translateY(${k * 14}px) scale(${1 - k * 0.04})`,
                  zIndex: 10 - k,
                  opacity: isTop ? 1 : 1 - k * 0.3,
                  boxShadow: isTop ? "0 30px 80px -30px rgba(0,0,0,0.9)" : undefined,
                }}
                aria-hidden={!isTop}
              >
                <CardFace card={c} />
                {isTop && (
                  <>
                    <span className="pointer-events-none absolute top-5 left-5 rounded-lg border-2 border-red px-2 py-0.5 font-mono text-sm font-bold text-red opacity-[calc(var(--lean,0)*-1)]" aria-hidden="true">
                      SCAM
                    </span>
                    <span className="pointer-events-none absolute top-5 right-5 rounded-lg border-2 border-green px-2 py-0.5 font-mono text-sm font-bold text-green opacity-[var(--lean,0)]" aria-hidden="true">
                      LEGIT
                    </span>
                  </>
                )}
                {isTop && revealed && (
                  <div className="verdict absolute inset-x-3 bottom-3 rounded-2xl border p-4 backdrop-blur-md" style={{ borderColor: revealed.correct ? "var(--green)" : "var(--red)", background: "color-mix(in oklab, var(--ink) 88%, transparent)" }} role="status">
                    <p className="flex items-center gap-2 font-medium" style={{ color: revealed.correct ? "var(--green)" : "var(--red)" }}>
                      {revealed.correct ? <CircleCheck className="size-5" aria-hidden="true" /> : <OctagonAlert className="size-5" aria-hidden="true" />}
                      {revealed.correct ? "Right." : "Not quite."} It&rsquo;s {c.answer === "scam" ? "a scam" : "legit"}.
                    </p>
                    <p className="mt-1.5 text-[0.88rem] leading-relaxed text-paper-dim">{c.why}</p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {c.tells.map((t) => (
                        <span key={t} className="rounded-full bg-ink-3 px-2 py-0.5 text-[0.72rem] text-paper">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

        {done && (
          <div className="glass absolute inset-0 grid place-items-center rounded-[1.75rem] p-6 text-center" role="status">
            <div>
              <Trophy className="mx-auto size-10 text-gold" aria-hidden="true" />
              <p className="display mt-3 text-6xl">
                <span className="text-molten">{score}</span>
                <span className="text-paper-dim">/{cards.length}</span>
              </p>
              <p className="mt-3 text-paper-dim">
                {score === cards.length ? "Flawless. You'd make a fine assayer." : score >= cards.length * 0.7 ? "Sharp eye. A couple slipped past." : "The scams are getting good. That's why ORO exists."}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <a className="btn btn-gold h-10 px-4 text-sm" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}>
                  <Share2 className="size-4" aria-hidden="true" /> Challenge a friend
                </a>
                <button type="button" onClick={restart} className="btn btn-ghost h-10 px-4 text-sm">
                  <RotateCcw className="size-4" aria-hidden="true" /> Play again
                </button>
                {compact && (
                  <Link href="/play" className="btn btn-ghost h-10 px-4 text-sm">
                    Full deck ({DECK.length})
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {!done && (
        <div className="mt-6 flex items-center justify-center gap-3">
          {revealed ? (
            <button key="next" type="button" onClick={next} className="btn btn-gold min-w-40" autoFocus>
              Next card <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          ) : (
            <>
              <button key="scam" type="button" onClick={() => answer("scam")} className="btn btn-ghost min-w-36 border-red/50 text-red hover:border-red hover:bg-red/10">
                <ArrowLeft className="size-4" aria-hidden="true" /> Scam
              </button>
              <button key="legit" type="button" onClick={() => answer("legit")} className="btn btn-ghost min-w-36 border-green/50 text-green hover:border-green hover:bg-green/10">
                Legit <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      )}
      <p className="mt-3 text-center text-[0.75rem] text-mute">Drag the card, tap a button, or use ← → keys.</p>
    </div>
  );
}
