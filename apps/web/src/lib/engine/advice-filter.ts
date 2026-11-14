/**
 * Advice filter (PLAN §9.2). Every sentence ORO writes passes through here.
 * ORO describes evidence; it never tells anyone what to do with a stock.
 * Quoted spans from the user's own tip are not ORO's words and are shown as quotes.
 */
const PATTERNS: RegExp[] = [
  /\b(you|we|i)\s+(should|must|can|could)\s+(buy|sell|hold|invest|exit|accumulate|average)\b/i,
  /\b(buy|sell|accumulate|exit)\s+(now|today|this|the stock|it|on dips?|at)\b/i,
  /\b(hold|keep holding)\s+(it|the stock|for)\b/i,
  /\bbook\s+profits?\b/i,
  /\bstop[\s-]?loss\b/i,
  /\btarget\s+(price\s+)?(of\s+)?₹?\s?\d/i,
  /\b(strong\s+)?(buy|sell)\s+(call|rating|signal|recommendation)\b/i,
  /\bshould\s+invest\b/i,
  /\b(kharid\s?(o|lo|na|le|lijiye)|bech\s?(o|do|na|de|dijiye)|le\s+lo|nikal\s+lo)\b/i,
  /\b(will|is going to)\s+(rise|fall|go up|go down|double|crash)\b/i,
];

export function adviceLeak(sentence: string): RegExp | null {
  for (const re of PATTERNS) if (re.test(sentence)) return re;
  return null;
}

const FALLBACK = "ORO only describes what records show. It does not suggest any action on a stock.";

/** Returns the text with any advice-like sentence replaced. Logs blocked sentences in dev. */
export function guard(text: string): string {
  const parts = text.split(/(?<=[.!?])\s+/);
  let blocked = false;
  const kept = parts.map((s) => {
    if (adviceLeak(s)) {
      blocked = true;
      if (process.env.NODE_ENV !== "production") console.warn("[advice-filter] blocked:", s);
      return null;
    }
    return s;
  });
  if (!blocked) return text;
  const out = kept.filter(Boolean).join(" ");
  return out || FALLBACK;
}

/** Fixed, helpful refusal for "should I buy/sell X?" questions. */
export const ADVICE_REFUSAL =
  "I can't tell you whether to put money into or take money out of any stock; that would be investment advice, and ORO isn't registered to give it. What I can do is show you what the filings, surveillance lists and disclosures say, and how much of your money is exposed. Want that instead?";

const QUESTION = /\b(should|shall|can|kya)\s+(i|we|mai|main|hum)\b.*\b(buy|sell|hold|invest|exit|kharid|bech|average|add)\b|\b(buy|sell|hold)\s+(or|ya)\s+(sell|hold|buy)\b|\b(good|right)\s+time\s+to\s+(buy|sell|invest|enter|exit)\b|\btarget\s+(price|kya)\b/i;

export function isAdviceQuestion(q: string) {
  return QUESTION.test(q);
}
