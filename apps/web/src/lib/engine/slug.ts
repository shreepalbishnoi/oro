/**
 * Public verdict links. Until the backend stores checks, the slug carries the
 * already-redacted text (deflated, base64url) and the verdict is recomputed
 * deterministically. Only created when the user taps Share.
 */
import { deflateRawSync, inflateRawSync } from "node:zlib";
import type { InputKind } from "./types";

const KIND: Record<InputKind, string> = { text: "t", link: "l", image: "i" };

export function encodeSlug(redacted: string, kind: InputKind = "text") {
  const body = deflateRawSync(Buffer.from(redacted, "utf8"), { level: 9 }).toString("base64url");
  return `${KIND[kind]}${body}`;
}

export function decodeSlug(slug: string): { text: string; kind: InputKind } | null {
  try {
    const k = slug[0];
    const kind = (Object.entries(KIND).find(([, v]) => v === k)?.[0] ?? null) as InputKind | null;
    if (!kind || slug.length > 6000) return null;
    const text = inflateRawSync(Buffer.from(slug.slice(1), "base64url"), { maxOutputLength: 8000 }).toString("utf8");
    return text ? { text, kind } : null;
  } catch {
    return null;
  }
}
