/**
 * Rule-based claim extraction. Stands in for the Haiku extractor (PLAN §9.2)
 * until the LLM pipeline is live, using the same claim schema.
 */
import { entityIn, numbersIn } from "./entities";
import { scrub } from "./scrub";
import type { Claim, ClaimKind, Entity } from "./types";

const EVENT =
  /\b(order|contract|letter of award|loa|deal|merger|merge|acquisition|acquire|acquiring|takeover|buyback|bonus|split|dividend|results?|profit|revenue|loss|stake|approval|approved|tie[\s-]?up|partnership|jv|joint venture|pledge|fund ?rais|qip|ipo|listing|expansion|plant|capacity)\b/i;
const PROMISE = /\b\d{2,4}\s?%|\bdouble\b|\bguarantee|\bassured|\bpakka\b|\bsure\s?shot\b|\bmultibagger\b|\b\d+x\b/i;
const PRICE = /\b(target|tgt|tp|sl|stop\s?loss|entry|cmp)\b\s*[:\-–]?\s*(₹|rs\.?)?\s?\d+/i;
const PRICE_ALL = /(target|tgt|tp|sl|stop\s?loss|entry|cmp)\s*[:\-–]?\s*(₹|rs\.?)?\s?\d+(\.\d+)?/gi;
const REG = /\bsebi\b.*\b(regd|registered|registration)\b|\bINH\d{9}\b/i;
const HEDGE = /\b(sources say|sources said|reportedly|rumou?r|buzz|likely|may|might|could|expected|sun(a|ne)\s+(hai|mein)|khabar|chatter|speculat|in talks|talks)\b/i;
const NAMED = /\b(as per|according to|filed|filing|announced|exchange|press release|reg(ulation)? 30|bse|nse)\b/i;

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।])\s+|\n+/)
    .map((s) => s.replace(/^[\s*•\-–>]+/, "").trim())
    .filter((s) => s.replace(/\p{Extended_Pictographic}/gu, "").trim().length >= 12);
}

function kindOf(s: string): ClaimKind | null {
  if (REG.test(s)) return "registration";
  if (EVENT.test(s)) return "corporate_event";
  if (PRICE.test(s)) return "price_call";
  if (PROMISE.test(s)) return "return_promise";
  return null;
}

export function extractClaims(raw: string, entities: Entity[]): Claim[] {
  const sentences = splitSentences(raw);
  const claims: Claim[] = [];
  let lastSubject: Entity | undefined = entities[0];
  for (const s of sentences) {
    const kind = kindOf(s);
    const subject: Entity | undefined = entityIn(s, entities) ?? lastSubject;
    if (entityIn(s, entities)) lastSubject = subject;
    if (!kind) continue;
    const text = scrub(s).redacted;
    claims.push({
      id: `c${claims.length + 1}`,
      text: text.length > 220 ? `${text.slice(0, 217)}…` : text,
      kind,
      subject: kind === "corporate_event" || kind === "price_call" ? subject : undefined,
      numbers: kind === "corporate_event" ? numbersIn(s.replace(PRICE_ALL, " ")) : [],
      hedging: HEDGE.test(s),
      attribution: NAMED.test(s) ? "named" : /\b(sources?|people|someone|log)\b/i.test(s) ? "anonymous" : "none",
      checkable: kind === "corporate_event" || kind === "registration",
    });
    if (claims.length >= 5) break;
  }
  return claims;
}
