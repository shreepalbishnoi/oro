/**
 * PII scrubber (PLAN §12). Runs before anything is stored, shown or shared.
 * Order matters: longer, more specific patterns first.
 */
const RULES: [RegExp, string][] = [
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "[email]"],
  [/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, "[PAN]"],
  [/\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g, "[Aadhaar]"],
  [/(?:\+?91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/g, "[phone]"],
  [/\b\d{9,18}\b/g, "[account no.]"],
  // UPI handle (name@bank). The handle itself is personal; the scam signal is kept separately.
  [/\b[\w.-]{2,}@(?!gmail|yahoo|outlook|hotmail)[a-z]{2,12}\b/gi, "[UPI id]"],
];

export function scrub(text: string): { redacted: string; removed: number } {
  let removed = 0;
  let out = text;
  for (const [re, label] of RULES) {
    out = out.replace(re, () => {
      removed++;
      return label;
    });
  }
  return { redacted: out, removed };
}
