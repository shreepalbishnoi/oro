import { ENTITIES } from "../fixtures/market";
import type { Entity } from "./types";

export function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/[^\p{L}\p{N}%₹.\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Longest-alias-first match against the instrument master (fixtures until the API is live). */
export function findEntities(text: string): Entity[] {
  const n = ` ${normalize(text)} `;
  const found: Entity[] = [];
  for (const e of ENTITIES) {
    const hit = [...e.aliases].sort((a, b) => b.length - a.length).some((a) => n.includes(` ${a} `) || n.includes(` ${a}.`));
    if (hit) {
      const { aliases: _a, ...entity } = e;
      void _a;
      found.push(entity);
    }
  }
  return found;
}

export function entityIn(sentence: string, entities: Entity[]): Entity | undefined {
  const n = ` ${normalize(sentence)} `;
  return entities.find((e) => {
    const src = ENTITIES.find((x) => x.symbol === e.symbol);
    return src?.aliases.some((a) => n.includes(` ${a} `) || n.includes(` ${a}.`));
  });
}

/** Numbers in a sentence, normalised to ₹ crore when a unit is present. */
export function numbersIn(s: string, moneyOnly = true): number[] {
  const out: number[] = [];
  const re = /(?:rs\.?|₹|inr)?\s*(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|k|%|x)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    let v = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(v)) continue;
    const unit = (m[2] ?? "").toLowerCase();
    if (unit === "lakh" || unit === "lac") v = v / 100;
    if (unit === "%" || unit === "x") continue; // percentages are promises or ratios, not amounts
    const hasCurrency = /^(rs|₹|inr)/i.test(m[0].trim());
    if (moneyOnly && !hasCurrency && !["crore", "cr", "lakh", "lac"].includes(unit)) continue;
    if (v === 0) continue;
    out.push(v);
  }
  return out;
}
