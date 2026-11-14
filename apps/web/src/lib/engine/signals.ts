/**
 * Scam engine rules (PLAN §9.3) that can run without the backend.
 * English + Hinglish patterns. Titles are ORO's own words and never advise.
 */
import { RA_REGISTRY, TRUSTED_DOMAINS } from "../fixtures/market";
import { scrub } from "./scrub";
import type { Entity, Signal } from "./types";

const SEBI_RA_CHECK = "https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=14";
const SEBI_CHECK_UPI = "https://www.sebi.gov.in/";

function span(text: string, re: RegExp): string | undefined {
  const m = text.match(re);
  if (!m || m.index === undefined) return undefined;
  const start = Math.max(0, m.index - 24);
  const end = Math.min(text.length, m.index + m[0].length + 24);
  const raw = `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
  return scrub(raw).redacted;
}

const GUARANTEE =
  /\b(guarantee[sd]?|guaranteed|assured|fixed)\s+(returns?|profits?|income|gains?)|\b100\s?%\s*(sure|safe|profit|guarantee|pakka|confirmed|certain)|\b(expected|potential|assured)\s+(returns?|upside|gains?|profit)\s*[:\-–]?\s*\d{2,4}\s?%|\bsure\s?-?\s?shot\b|\bpakka\s+(profit|return|munafa)|\b(zero|no)\s+risk\b|\brisk[\s-]?free\b|\bdouble\s+(your\s+)?(money|paisa|investment)|\bpaisa\s+double\b|\b\d{2,4}\s?%\s*(returns?|profit|gain|munafa)\s*(in|within|har|every|per)?\s*\d*\s*(days?|din|weeks?|hafte|months?|mahine)?|\bloss\s+(nahi|nhi|impossible)\b/i;
const URGENCY =
  /\b(only\s+today|today\s+only|aaj\s+hi|abhi\s+(join|lo|karo)|jaldi|last\s+chance|limited\s+(seats?|slots?|time)|hurry|turant|urgent(ly)?|immediately|right\s+now|before\s+(the\s+)?market\s+(open(s|ing)?|closes?)|don'?t\s+miss|before\s+\d{1,2}(:\d{2})?\s*(am|pm|baje)?|kal\s+tak|offer\s+ends|closing\s+soon|next\s+\d+\s+(minutes|mins|hours))\b/i;
const SECRECY =
  /\b(vip\s+(group|channel|call|tips?)|premium\s+(group|channel)|insider\s+(news|info|tip)|inside\s+news|operator(\s+game|\s+news)?|confidential|don'?t\s+share|kisi\s+ko\s+(mat|na)\s+batana|secret\s+(tip|news|call))\b/i;
const SEBI_CLAIM = /\bsebi[\s-]*(regd\.?|registered|registration|reg\.?|approved\s+advisor|certified)\b|\bINH\d{9}\b/i;
const RA_NO = /\bINH\d{9}\b/gi;
const FAKE_AUTH =
  /\b(sebi|nse|bse|rbi)\s+(approved|endorsed|verified|backed|recommended)\s+(stock|tip|call|share|scheme)|\b(endorsed|recommended|backed)\s+by\s+(sebi|nse|bse|rbi|cnbc|zee\s+business|et\s+now)|\bas\s+seen\s+on\s+(cnbc|zee|et\s+now|ndtv)/i;
const UPI = /\b[\w.-]{2,}@(okaxis|oksbi|okhdfcbank|okicici|ybl|ibl|axl|paytm|upi|apl|fbl|kotak|icici|sbi|hdfcbank|yesbank|freecharge|jupiteraxis)\b/i;
const PAYMENT = /\b(pay|fees?|subscription|charges?|join\s+fee|membership)\b.{0,30}(₹|rs\.?|inr)\s?\d+|(₹|rs\.?)\s?\d+\s*(only|mein|me)\b.{0,20}\b(join|membership|vip|tips?)/i;
const PRICE_CALL = /\b(target|tgt|tp)\s*[:\-–]?\s*(₹|rs\.?)?\s?\d+|\b(sl|stop\s?loss)\s*[:\-–]?\s*\d+|\b(entry|cmp)\s*[:\-–]?\s*(₹|rs\.?)?\s?\d+/i;
const PUMP = /\b(multi[\s-]?bagger|rocket|to\s+the\s+moon|upper\s+circuit|uc\s+(lagega|pakka)|\d{1,3}x\s+(return|stock|potential)|jackpot|bumper)\b|🚀/iu;
const FORWARDED = /forwarded\s+many\s+times|^forwarded\b/im;
const PRIVATE_GROUP = /(t\.me\/(\+|joinchat)|chat\.whatsapp\.com\/|telegram\.me\/\+)/i;

const URL_RE = /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)/gi;
const SHORTENERS = ["bit.ly", "tinyurl.com", "t.ly", "cutt.ly", "rb.gy", "is.gd", "shorturl.at", "rebrand.ly", "tiny.cc"];
const BRANDS = ["zerodha", "groww", "upstox", "angelone", "angel", "icicidirect", "hdfcsec", "kotak", "nse", "bse", "sebi", "amfi", "cdsl", "nsdl"];

function lev(a: string, b: string) {
  const m = a.length,
    n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}

export function hostOf(url: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function linkSignals(text: string): Signal[] {
  const out: Signal[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(URL_RE)) {
    const url = m[1];
    const host = hostOf(url);
    if (!host || seen.has(host)) continue;
    // Ignore things like "Rs.420" or "1.5x" picked up as hosts.
    if (!/[a-z]/.test(host.split(".").slice(-1)[0]) || /^\d/.test(host)) continue;
    seen.add(host);
    const trusted = TRUSTED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
    if (/\.apk(\?|$)/i.test(url)) {
      out.push({ id: "link_apk", severity: "severe", title: "Link downloads an app file (.apk)", detail: `${host} serves an Android app outside the Play Store. Fake trading apps are a common way to take deposits that can't be withdrawn.`, span: url });
    }
    if (host.startsWith("xn--") || host.includes(".xn--")) {
      out.push({ id: "link_idn", severity: "severe", title: "Link uses look-alike letters", detail: `${host} is an internationalised domain. These can display as a familiar name while pointing somewhere else.`, span: url });
    }
    if (SHORTENERS.includes(host)) {
      out.push({ id: "link_shortener", severity: "medium", title: "Link hides where it goes", detail: `${host} is a URL shortener, so you can't see the real destination before tapping.`, span: url });
    }
    if (!trusted) {
      const label = host.split(".").slice(0, -1).join(".");
      for (const d of TRUSTED_DOMAINS) {
        const dl = d.split(".")[0];
        const brand = BRANDS.find((b) => label.includes(b));
        const close = lev(label.replace(/[-.]/g, ""), dl) <= 2 && label.replace(/[-.]/g, "") !== dl;
        if (close || (brand && brand.length >= 3 && dl.startsWith(brand))) {
          out.push({ id: "link_lookalike", severity: "severe", title: "Link imitates a known broker or exchange", detail: `${host} looks like ${d} but isn't it. Look-alike domains are used to collect logins and payments.`, span: url, evidence: { label: `Official site: ${d}`, url: `https://${d}` } });
          break;
        }
      }
    }
    if (PRIVATE_GROUP.test(url)) {
      out.push({ id: "private_group", severity: "medium", title: "Invites you into a private group", detail: "Pump-and-dump schemes move people into private Telegram or WhatsApp groups where messages can't be checked or traced later.", span: url });
    }
  }
  return out;
}

export function detectSignals(raw: string, entities: Entity[]): Signal[] {
  const s: Signal[] = [];
  const has = (re: RegExp) => re.test(raw);

  if (has(GUARANTEE))
    s.push({ id: "guaranteed_returns", severity: "severe", title: "Promises fixed or guaranteed returns", detail: "No listed stock can guarantee a return. SEBI-registered analysts are barred from promising one. This is the single most common sign of an investment scam.", span: span(raw, GUARANTEE) });

  if (has(URGENCY))
    s.push({ id: "urgency", severity: "medium", title: "Pushes you to act fast", detail: "Deadlines like “only today” are used so you don't have time to check. Real filings don't expire in an hour.", span: span(raw, URGENCY) });

  if (has(SECRECY))
    s.push({ id: "secrecy", severity: "medium", title: "Claims secret or insider information", detail: "Trading on genuine unpublished price-sensitive information is illegal, and “insider” or “operator” tips are almost always invented to create urgency.", span: span(raw, SECRECY) });

  if (has(SEBI_CLAIM)) {
    const nums = [...raw.matchAll(RA_NO)].map((m) => m[0].toUpperCase());
    const unknown = nums.filter((n) => !RA_REGISTRY.has(n));
    if (nums.length === 0) {
      s.push({ id: "sebi_claim", severity: "medium", title: "Claims SEBI registration without a number", detail: "Registered research analysts must show their registration number (INH…). This message claims registration but gives none to check.", span: span(raw, SEBI_CLAIM), evidence: { label: "SEBI register of research analysts", url: SEBI_RA_CHECK } });
    } else if (unknown.length) {
      s.push({ id: "sebi_claim", severity: "medium", title: `Registration ${unknown[0]} not in our register snapshot`, detail: "We couldn't match this number in ORO's copy of the SEBI register (pre-launch sample). Check it on SEBI's site, and confirm the name matches the sender.", span: unknown[0], evidence: { label: "Check on SEBI's register", url: SEBI_RA_CHECK } });
    }
    if (has(GUARANTEE))
      s.push({ id: "registered_promise", severity: "severe", title: "“Registered” sender promising returns", detail: "SEBI's rules forbid registered analysts from assuring returns. Either the registration claim or the promise is false.", evidence: { label: "SEBI research analyst rules", url: "https://www.sebi.gov.in/legal/regulations.html" } });
  }

  if (has(FAKE_AUTH))
    s.push({ id: "fake_authority", severity: "severe", title: "Says a regulator or channel backs this tip", detail: "SEBI, the exchanges and the RBI never approve or endorse individual stock tips. Celebrity and TV endorsements in forwards are routinely faked.", span: span(raw, FAKE_AUTH) });

  if (has(UPI) || has(PAYMENT))
    s.push({ id: "upi_payment", severity: "medium", title: "Asks for money to a personal account", detail: "Registered entities collect fees through verified channels. SEBI's “Validated UPI” handles end in @valid; payments to personal UPI ids are hard to trace or recover.", span: span(raw, has(UPI) ? UPI : PAYMENT), evidence: { label: "SEBI investor resources", url: SEBI_CHECK_UPI } });

  if (has(PRICE_CALL))
    s.push({ id: "price_call", severity: "medium", title: "Names exact prices to act at", detail: "Specific entry and exit prices from an unknown sender are a hallmark of paid “tip” channels. ORO doesn't judge predictions, only facts.", span: span(raw, PRICE_CALL) });

  if (has(PUMP))
    s.push({ id: "pump_language", severity: "medium", title: "Hype language typical of pump schemes", detail: "Words like “multibagger” and “upper circuit pakka” are used to build a crowd that buys at the same time, so early holders can exit.", span: span(raw, PUMP) });

  if (has(FORWARDED))
    s.push({ id: "forwarded", severity: "info", title: "Forwarded many times", detail: "The original sender is unknown, so nobody is accountable for this message." });

  s.push(...linkSignals(raw));

  for (const e of entities) {
    if (e.surveillance)
      s.push({ id: "surveillance", severity: "medium", title: `${e.name} is under exchange surveillance`, detail: `The exchange has placed ${e.symbol} under ${e.surveillance}, a measure used when price or volume moves look unusual.`, evidence: { label: "NSE surveillance list", url: "https://www.nseindia.com/reports/asm" } });
    if (e.sme)
      s.push({ id: "sme_low_float", severity: "medium", title: `${e.name} is a small, thinly traded SME stock`, detail: "SME stocks have few shares in public hands, so a small group can move the price easily. Most pump schemes target them." });
    if (e.spike)
      s.push({ id: "volume_spike", severity: "medium", title: "Unusual trading before this message", detail: `${e.spike}, based on end-of-day exchange data.` });
  }

  const order = { severe: 0, medium: 1, info: 2 } as const;
  return s.sort((a, b) => order[a.severity] - order[b.severity]);
}
