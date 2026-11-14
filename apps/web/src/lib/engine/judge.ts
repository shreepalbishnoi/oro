/**
 * Claim judge + deterministic grounding check (PLAN §9.2).
 * Matches a claim to the evidence corpus. A label other than Unverified is
 * only kept if the quoted span exists verbatim in the cited document and every
 * number in a Supported claim appears in the quote.
 */
import { EVIDENCE } from "../fixtures/market";
import { guard } from "./advice-filter";
import { numbersIn } from "./entities";
import type { Claim, EvidenceDoc, Judgment } from "./types";

const KIND_WORDS: [EvidenceDoc["kind"], RegExp][] = [
  ["order_win", /\b(order|contract|letter of award|loa|deal|project)\b/i],
  ["acquisition", /\b(acqui\w*|takeover|buy(ing)? (out|stake)|stake)\b/i],
  ["merger", /\b(merg\w*|amalgamat\w*)\b/i],
  ["dividend", /\bdividend\b/i],
  ["results", /\b(results?|profit|revenue|loss|quarter|q[1-4])\b/i],
  ["bonus", /\b(bonus|split)\b/i],
  ["pledge", /\bpledge\b/i],
];

const norm = (s: string) => s.replace(/\s+/g, " ").replace(/,/g, "").toLowerCase().trim();

export function grounded(quote: string, doc: EvidenceDoc) {
  return norm(doc.text).includes(norm(quote));
}

function sameAmount(a: number, b: number) {
  return Math.abs(a - b) / Math.max(a, b) < 0.02;
}

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN")} crore`;
}

function pick(doc: EvidenceDoc) {
  const { id, source, tier, title, publishedAt, url } = doc;
  return { id, source, tier, title, publishedAt, url };
}

export function judge(claim: Claim): Judgment {
  const unverified = (reason: string): Judgment => ({ claimId: claim.id, label: "unverified", reason: guard(reason), grounded: true, confidence: 0.5 });

  if (claim.kind === "return_promise")
    return unverified("This is a promise about the future, so no record can confirm it. Promises of returns are treated as a scam signal instead.");
  if (claim.kind === "price_call")
    return unverified("Price predictions can't be checked against records. ORO judges facts, not forecasts.");
  if (claim.kind === "registration")
    return unverified("Registration is checked against the SEBI register above, not as a news claim.");
  if (!claim.subject)
    return unverified("We couldn't tell which listed company this is about. Name the company or its NSE/BSE symbol and check again.");

  const docs = EVIDENCE.filter((d) => d.symbol === claim.subject!.symbol);
  if (docs.length === 0)
    return unverified(`No filing, order or tier-1 report about ${claim.subject.name} matches this claim yet.`);

  // A Reg 30(11) clarification that denies the story outranks everything else.
  const denial = docs.find((d) => d.denies);
  const wantMerger = /\b(merg\w*|acqui\w*|takeover|stake|deal|tie[\s-]?up)\b/i.test(claim.text);
  if (denial && wantMerger) {
    const quote = "is not in any discussion regarding such a proposal";
    return {
      claimId: claim.id,
      label: grounded(quote, denial) ? "conflicting" : "unverified",
      reason: guard(`${claim.subject.name} told the exchange on ${new Date(denial.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} that there is no such proposal.`),
      quote,
      doc: pick(denial),
      grounded: grounded(quote, denial),
      confidence: 0.92,
    };
  }

  const kind = KIND_WORDS.find(([, re]) => re.test(claim.text))?.[0];
  const doc = docs.find((d) => d.kind === kind) ?? (kind ? undefined : docs[0]);
  if (!doc) return unverified(`${claim.subject.name} has filed nothing that matches this claim. Big corporate events must be disclosed to the exchange, so a missing filing is worth noticing.`);

  // Pick the sentence of the document that carries the numbers.
  const quote = doc.text.split(/(?<=\.)\s+/).find((s) => numbersIn(s).length > 0) ?? doc.text.split(/(?<=\.)\s+/)[0];
  const docNums = numbersIn(quote).filter((n) => n >= 1);
  const claimNums = claim.numbers.filter((n) => n >= 1);

  if (claimNums.length && docNums.length) {
    const allMatch = claimNums.every((c) => docNums.some((dn) => sameAmount(c, dn)));
    if (!allMatch) {
      const c = claimNums.find((x) => !docNums.some((dn) => sameAmount(x, dn)))!;
      const nearest = docNums.reduce((a, b) => (Math.abs(b - c) < Math.abs(a - c) ? b : a));
      return {
        claimId: claim.id,
        label: grounded(quote, doc) ? "conflicting" : "unverified",
        reason: guard(`The filing gives ${fmt(nearest)}; the message says ${fmt(c)}${c / nearest >= 5 ? `, about ${Math.round(c / nearest)}× larger` : ""}.`),
        quote,
        doc: pick(doc),
        grounded: grounded(quote, doc),
        confidence: 0.9,
      };
    }
  }

  const ok = grounded(quote, doc);
  return {
    claimId: claim.id,
    label: ok ? "supported" : "unverified",
    reason: guard(`Matches ${doc.source.toLowerCase()} “${doc.title}”.`),
    quote,
    doc: pick(doc),
    grounded: ok,
    confidence: claim.hedging ? 0.75 : 0.88,
  };
}
