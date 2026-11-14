"use client";

import { useId, useRef, useState } from "react";
import { ArrowRight, ClipboardPaste, ImageUp, Loader2 } from "lucide-react";
import { SAMPLE_TIPS } from "@/lib/fixtures/tips";
import { Magnetic } from "@/components/motion/magnetic";

/** Shrinks a screenshot in the browser (max 1600 px, JPEG) so uploads stay small on mobile data. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.85));
}

/** Paste-first input: clipboard button (iPhone path), screenshot reading, sample tips, ⌘/Ctrl+Enter. */
export function TipInput({
  onSubmit,
  busy,
  initial = "",
  autoFocus = false,
  size = "lg",
}: {
  onSubmit: (text: string, kind: "text" | "link" | "image") => void;
  busy: boolean;
  initial?: string;
  autoFocus?: boolean;
  size?: "lg" | "md";
}) {
  const [text, setText] = useState(initial);
  const [note, setNote] = useState<string | null>(null);
  const id = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fromImage, setFromImage] = useState(false);
  const [reading, setReading] = useState(false);

  async function readScreenshot(file: File) {
    if (!file.type.startsWith("image/")) return setNote("That isn't an image. Choose a screenshot.");
    setReading(true);
    setNote("Reading your screenshot. The image is used once and not stored.");
    try {
      const fd = new FormData();
      fd.set("file", await shrink(file), "screenshot.jpg");
      const res = await fetch("/api/v1/checks/read-image", { method: "POST", body: fd });
      const p = (await res.json().catch(() => ({}))) as { text?: string; piiRemoved?: number; title?: string; detail?: string };
      if (!res.ok || !p.text) {
        setNote(p.detail ?? p.title ?? "Couldn't read that screenshot. Copy the message text and paste it instead.");
        return;
      }
      setText(p.text);
      setFromImage(true);
      setNote(`Read from your screenshot${p.piiRemoved ? `, ${p.piiRemoved} personal detail${p.piiRemoved > 1 ? "s" : ""} removed` : ""}. Fix anything misread, then assay it.`);
      area.current?.focus();
    } catch {
      setNote("Couldn't read that screenshot. Copy the message text and paste it instead.");
    } finally {
      setReading(false);
    }
  }

  const kind = fromImage ? "image" : /^\s*(https?:\/\/|www\.)\S+\s*$/i.test(text) ? "link" : "text";
  const submit = () => {
    if (text.trim().length < 8) {
      setNote("Paste a little more of the message so there's something to check.");
      area.current?.focus();
      return;
    }
    setNote(null);
    onSubmit(text.trim(), kind);
  };

  return (
    <form
      className="glass relative rounded-[1.6rem] p-2 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor={id} className="sr-only">
        Paste a tip, forward, headline or link
      </label>
      <textarea
        ref={area}
        id={id}
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => {
          setText(e.target.value);
          if (!e.target.value) setFromImage(false);
        }}
        onPaste={(e) => {
          const img = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"))?.getAsFile();
          if (img) {
            e.preventDefault();
            void readScreenshot(img);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        rows={size === "lg" ? 4 : 3}
        maxLength={4000}
        placeholder="Paste the message, headline or link here"
        className="block w-full resize-none rounded-[1.2rem] bg-transparent px-4 pt-3.5 pb-2 text-[1rem] leading-relaxed text-paper placeholder:text-mute focus:outline-none"
        aria-describedby={`${id}-hint`}
      />
      <div className="flex flex-wrap items-center gap-2 px-2 pb-1.5">
        <button
          type="button"
          className="btn h-9 gap-1.5 rounded-full border border-line px-3 text-[0.82rem] text-paper-dim hover:border-gold/50 hover:text-paper"
          onClick={async () => {
            try {
              const t = await navigator.clipboard.readText();
              if (t) setText(t.slice(0, 4000));
            } catch {
              setNote("Your browser blocked clipboard access. Long-press in the box and paste instead.");
            }
          }}
        >
          <ClipboardPaste className="size-4" aria-hidden="true" /> Paste
        </button>
        <button
          type="button"
          className="btn h-9 gap-1.5 rounded-full border border-line px-3 text-[0.82rem] text-paper-dim hover:border-gold/50 hover:text-paper"
          onClick={() => fileRef.current?.click()}
          disabled={reading}
        >
          {reading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ImageUp className="size-4" aria-hidden="true" />} {reading ? "Reading…" : "Screenshot"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          aria-label="Upload a screenshot of the tip"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void readScreenshot(f);
          }}
        />
        <span id={`${id}-hint`} className="ml-auto hidden text-[0.8rem] font-medium text-mute sm:inline">
          {text.length > 0 ? `${text.length}/4000` : "Ctrl + Enter to check"}
        </span>
        <Magnetic>
          <button type="submit" className="btn btn-gold h-11" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {busy ? "Checking…" : "Check it"}
            {!busy && <ArrowRight className="size-4" aria-hidden="true" />}
          </button>
        </Magnetic>
      </div>
      {note && (
        <p role="status" className="mx-3 mb-2 rounded-xl bg-ink-3/70 px-3 py-2 text-[0.82rem] text-paper-dim">
          {note}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-3 pt-2.5 pb-1.5">
        <span className="mr-1 text-[0.8rem] text-mute">Examples:</span>
        {SAMPLE_TIPS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setText(t.text);
              setNote(null);
              onSubmit(t.text, "text");
            }}
            className="rounded-full border border-line px-2.5 py-1 text-[0.78rem] text-paper-dim transition hover:border-gold/50 hover:bg-gold/5 hover:text-paper"
          >
            {t.label}
          </button>
        ))}
      </div>
    </form>
  );
}
