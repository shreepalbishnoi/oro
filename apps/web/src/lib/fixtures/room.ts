/**
 * Demo Room: a sample portfolio built on the fictional universe in market.ts.
 * Values are "as of last close" (7 Nov 2026); ORO never shows live prices.
 */

export const AS_OF = "7 Nov 2026";
export const AS_OF_ISO = "2026-11-07";

export type Account = { id: string; name: string; kind: "demat" | "mf"; source: "CAS" | "CSV" | "Manual"; provider: string; statementDate: string };

export const ACCOUNTS: Account[] = [
  { id: "cdsl", name: "CDSL demat", kind: "demat", source: "CAS", provider: "CDSL CAS", statementDate: "2026-11-01" },
  { id: "cams", name: "Mutual funds", kind: "mf", source: "CAS", provider: "CAMS + KFintech CAS", statementDate: "2026-11-01" },
];

export type Holding = { symbol: string; qty: number; close: number; account: "cdsl" };

export const HOLDINGS: Holding[] = [
  { symbol: "HIMGIRI", qty: 25, close: 1964.0, account: "cdsl" },
  { symbol: "VEDANTRX", qty: 30, close: 1288.0, account: "cdsl" },
  { symbol: "MERIDPORT", qty: 40, close: 812.5, account: "cdsl" },
  { symbol: "KAVERIPWR", qty: 120, close: 146.2, account: "cdsl" },
  { symbol: "TARANGTEL", qty: 600, close: 18.45, account: "cdsl" },
];

export type Fund = { id: string; name: string; short: string; category: string; value: number; units: number; nav: number; disclosed: string; weights: Record<string, number> };

export const FUNDS: Fund[] = [
  {
    id: "sahyadri-flexi",
    name: "Sahyadri Flexi Cap Fund · Direct Growth",
    short: "Sahyadri Flexi Cap",
    category: "Flexi cap",
    value: 185000,
    units: 2412.6,
    nav: 76.68,
    disclosed: "31 Oct 2026",
    weights: { MERIDPORT: 0.061, HIMGIRI: 0.042, KAVERIPWR: 0.034, VEDANTRX: 0.03, AAROHAN: 0.028 },
  },
  {
    id: "ganga-lmc",
    name: "Ganga Large & Mid Cap Fund · Direct Growth",
    short: "Ganga Large & Mid",
    category: "Large & mid cap",
    value: 120000,
    units: 3871.2,
    nav: 31.0,
    disclosed: "31 Oct 2026",
    weights: { MERIDPORT: 0.045, VEDANTRX: 0.038, KAVERIPWR: 0.026, TARANGTEL: 0.02 },
  },
  {
    id: "narmada-small",
    name: "Narmada Small Cap Fund · Direct Growth",
    short: "Narmada Small Cap",
    category: "Small cap",
    value: 60000,
    units: 1530.8,
    nav: 39.2,
    disclosed: "31 Oct 2026",
    weights: { NIRMALBIO: 0.024, AAROHAN: 0.031, SURYAFIN: 0.019 },
  },
];

export type Story = {
  id: string;
  symbol: string;
  headline: string;
  plain: string;
  kind: "filing" | "flag" | "rumour" | "results" | "event";
  karat: number;
  source: string;
  sourceUrl: string;
  publishedAt: string; // ISO with time
  ago: string;
  claims: { text: string; label: "supported" | "conflicting" | "unverified"; quote?: string }[];
  impact?: { p10: number; p50: number; p90: number; n: number; days: number; category: string };
  severity: "high" | "medium" | "low";
};

export const STORIES: Story[] = [
  {
    id: "kav-order",
    symbol: "KAVERIPWR",
    headline: "Kaveri Power wins a ₹420 crore substation order",
    plain: "A state transmission utility awarded Kaveri Power a 400 kV substation package worth ₹420 crore, to be built over 24 months. It's about 9% of last year's revenue.",
    kind: "filing",
    karat: 22,
    source: "NSE filing · Reg 30",
    sourceUrl: "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
    publishedAt: "2026-11-07T15:42:00+05:30",
    ago: "2 h ago",
    claims: [
      { text: "Order value is ₹420 crore", label: "supported", quote: "valued at Rs 420 crore" },
      { text: "Forwards claiming ₹4,200 crore", label: "conflicting", quote: "valued at Rs 420 crore" },
    ],
    impact: { p10: -1.2, p50: 1.4, p90: 4.8, n: 142, days: 5, category: "Order wins, mid cap, capital goods" },
    severity: "medium",
  },
  {
    id: "nir-pledge",
    symbol: "NIRMALBIO",
    headline: "Nirmal Biotech's promoter pledged 31.2% of the company",
    plain: "The promoter now has 31.2% of all shares pledged as loan collateral, up from 12.0%. If those loans are called, pledged shares can be sold in the market.",
    kind: "flag",
    karat: 21,
    source: "BSE filing · SAST",
    sourceUrl: "https://www.bseindia.com/corporates/ann.html",
    publishedAt: "2026-11-05T18:10:00+05:30",
    ago: "2 days ago",
    claims: [{ text: "Pledge rose from 12.0% to 31.2%", label: "supported", quote: "up from 12.0% previously" }],
    impact: { p10: -9.8, p50: -3.1, p90: 1.6, n: 64, days: 5, category: "Pledge increase > 10 pts, SME" },
    severity: "high",
  },
  {
    id: "sur-denial",
    symbol: "SURYAFIN",
    headline: "Surya Fincap denies the foreign-bank merger rumour",
    plain: "After a merger story spread on Telegram, the exchange asked Surya Fincap to clarify. The company says there is no such proposal. The stock is also under ASM Stage II surveillance.",
    kind: "rumour",
    karat: 23,
    source: "NSE filing · Reg 30(11)",
    sourceUrl: "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
    publishedAt: "2026-11-06T11:05:00+05:30",
    ago: "1 day ago",
    claims: [{ text: "“Merging with a foreign bank”", label: "conflicting", quote: "is not in any discussion regarding such a proposal" }],
    severity: "high",
  },
  {
    id: "mer-acq",
    symbol: "MERIDPORT",
    headline: "Meridian Ports to buy Coastline Terminals for ₹1,350 crore",
    plain: "Meridian signed an agreement to acquire 100% of a terminal operator. It's Meridian's largest purchase in three years and adds a second west-coast terminal.",
    kind: "filing",
    karat: 22,
    source: "NSE filing · Reg 30",
    sourceUrl: "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
    publishedAt: "2026-11-01T19:30:00+05:30",
    ago: "6 days ago",
    claims: [{ text: "Consideration of ₹1,350 crore for 100%", label: "supported", quote: "for a consideration of Rs 1,350 crore" }],
    impact: { p10: -3.9, p50: -0.4, p90: 2.7, n: 88, days: 5, category: "Acquisitions, large cap" },
    severity: "medium",
  },
  {
    id: "mer-div",
    symbol: "MERIDPORT",
    headline: "Meridian Ports declares a ₹7 interim dividend",
    plain: "₹7 per share; you'll receive it if you hold the shares on the record date, 20 November. On your 40 shares that's ₹280.",
    kind: "event",
    karat: 23,
    source: "NSE filing · Reg 30",
    sourceUrl: "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
    publishedAt: "2026-11-04T16:00:00+05:30",
    ago: "3 days ago",
    claims: [{ text: "₹7 per share, record date 20 Nov", label: "supported", quote: "interim dividend of Rs 7 per equity share" }],
    severity: "low",
  },
  {
    id: "him-bonus",
    symbol: "HIMGIRI",
    headline: "Himgiri Cements' board recommends a 1:1 bonus issue",
    plain: "Shareholders will vote on giving one free share for every share held. A bonus doesn't change what your holding is worth; it splits it into more shares.",
    kind: "filing",
    karat: 22,
    source: "NSE filing · Board outcome",
    sourceUrl: "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
    publishedAt: "2026-11-08T13:20:00+05:30",
    ago: "today",
    claims: [{ text: "Bonus ratio 1:1, needs shareholder approval", label: "supported", quote: "bonus issue of equity shares in the ratio of 1:1" }],
    severity: "low",
  },
  {
    id: "tar-results",
    symbol: "TARANGTEL",
    headline: "Tarang Telecom's quarterly loss narrows to ₹212 crore",
    plain: "Still loss-making, but the loss is ₹93 crore smaller than the same quarter last year.",
    kind: "results",
    karat: 21,
    source: "NSE filing · Results",
    sourceUrl: "https://www.nseindia.com/companies-listing/corporate-filings-financial-results",
    publishedAt: "2026-11-03T17:45:00+05:30",
    ago: "4 days ago",
    claims: [{ text: "Net loss ₹212 crore vs ₹305 crore", label: "supported", quote: "Net loss for the quarter was Rs 212 crore" }],
    impact: { p10: -4.4, p50: 0.6, p90: 5.9, n: 210, days: 5, category: "Results, loss narrows, telecom" },
    severity: "low",
  },
];

export type Flag = { symbol: string; date: string; title: string; detail: string; severity: "high" | "medium"; source: string };

export const FLAGS: Flag[] = [
  { symbol: "NIRMALBIO", date: "2026-11-05", title: "Promoter pledge up to 31.2%", detail: "From 12.0%. Pledged shares can be sold if loans are called.", severity: "high", source: "BSE SAST filing" },
  { symbol: "SURYAFIN", date: "2026-11-02", title: "Entered ASM Stage II", detail: "Exchange surveillance after unusual price and volume moves.", severity: "medium", source: "NSE surveillance list" },
  { symbol: "SURYAFIN", date: "2026-11-04", title: "Promoter-group sale, 1.4% of equity", detail: "Disclosed under insider-trading rules.", severity: "medium", source: "NSE PIT disclosure" },
  { symbol: "NIRMALBIO", date: "2026-10-21", title: "Results filed 9 days late", detail: "Quarterly results came after the regulatory deadline.", severity: "medium", source: "BSE filing" },
  { symbol: "TARANGTEL", date: "2026-09-30", title: "Credit rating cut to BBB-", detail: "Rating agency cited high debt and continued losses.", severity: "medium", source: "Rating agency press release" },
];

export type Rumour = {
  id: string;
  symbol: string;
  summary: string;
  state: "unverified" | "confirmed" | "denied" | "stale";
  firstSeen: string;
  steps: { at: string; text: string; state: "seen" | "asked" | "resolved" }[];
};

export const RUMOURS: Rumour[] = [
  {
    id: "r-sur-merger",
    symbol: "SURYAFIN",
    summary: "Surya Fincap to merge with a foreign bank",
    state: "denied",
    firstSeen: "2026-11-04",
    steps: [
      { at: "4 Nov · 09:12", text: "Story starts spreading on Telegram and X", state: "seen" },
      { at: "5 Nov · 18:40", text: "Exchange seeks clarification from the company", state: "asked" },
      { at: "6 Nov · 11:05", text: "Company files: no such proposal", state: "resolved" },
    ],
  },
  {
    id: "r-kav-stake",
    symbol: "KAVERIPWR",
    summary: "A global utility is buying a stake in Kaveri Power",
    state: "unverified",
    firstSeen: "2026-11-07",
    steps: [{ at: "7 Nov · 20:15", text: "Mentioned in two news reports citing unnamed sources", state: "seen" }],
  },
  {
    id: "r-him-merger",
    symbol: "HIMGIRI",
    summary: "Himgiri to merge with Aarohan Infra",
    state: "confirmed",
    firstSeen: "2026-09-12",
    steps: [
      { at: "12 Sep", text: "Reported by a business daily", state: "seen" },
      { at: "14 Sep", text: "Company says it is evaluating options", state: "asked" },
      { at: "2 Oct", text: "Board approves the scheme of amalgamation", state: "resolved" },
    ],
  },
];

export type CalEvent = { date: string; symbol: string; title: string; kind: "Record date" | "Board meeting" | "AGM" | "Results" | "Vote" };

export const EVENTS: CalEvent[] = [
  { date: "2026-11-14", symbol: "VEDANTRX", title: "Board meeting: quarterly results", kind: "Board meeting" },
  { date: "2026-11-20", symbol: "MERIDPORT", title: "Record date: ₹7 interim dividend", kind: "Record date" },
  { date: "2026-11-27", symbol: "HIMGIRI", title: "Shareholder vote on 1:1 bonus", kind: "Vote" },
  { date: "2026-12-04", symbol: "TARANGTEL", title: "Extraordinary general meeting", kind: "AGM" },
  { date: "2026-12-11", symbol: "HIMGIRI", title: "Record date: bonus shares (if approved)", kind: "Record date" },
  { date: "2027-01-22", symbol: "KAVERIPWR", title: "Q3 results (expected)", kind: "Results" },
];

export type Member = { id: string; name: string; relation: string; consent: "active" | "invited"; guardian: boolean; lastCheck?: string };

export const FAMILY: Member[] = [
  { id: "m1", name: "You", relation: "Owner", consent: "active", guardian: false },
  { id: "m2", name: "Papa", relation: "Father", consent: "active", guardian: true, lastCheck: "High risk tip checked · 2 days ago" },
  { id: "m3", name: "Riya", relation: "Sister", consent: "invited", guardian: false },
];

export const LAST_VISIT = "4 Nov 2026";
