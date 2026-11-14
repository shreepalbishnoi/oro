/**
 * Sample market universe for the pre-launch preview.
 * EVERY company, filing, fund and person here is FICTIONAL. Real companies
 * are never given invented filings or red flags. When the evidence pipeline
 * (PLAN M1/M2) is live, these are replaced by BSE/NSE/SEBI records.
 */
import type { Disclosure, Entity, EvidenceDoc } from "../engine/types";

export const ENTITIES: (Entity & { aliases: string[] })[] = [
  {
    symbol: "KAVERIPWR",
    name: "Kaveri Power Systems",
    exchange: "NSE",
    sector: "Capital goods",
    group: "Kaveri Group",
    aliases: ["kaveri power", "kaveri", "kaveripwr", "कावेरी"],
  },
  {
    symbol: "MERIDPORT",
    name: "Meridian Ports & Logistics",
    exchange: "NSE",
    sector: "Ports & logistics",
    group: "Meridian Group",
    aliases: ["meridian ports", "meridian port", "meridport", "meridian"],
  },
  {
    symbol: "SURYAFIN",
    name: "Surya Fincap",
    exchange: "NSE SME",
    sector: "NBFC",
    sme: true,
    surveillance: "ASM Stage II",
    spike: "Volume 11× its 60-day average on 6 Nov",
    aliases: ["surya fincap", "suryafin", "surya finance", "surya"],
  },
  {
    symbol: "NIRMALBIO",
    name: "Nirmal Biotech",
    exchange: "BSE SME",
    sector: "Pharma",
    sme: true,
    spike: "Price up 64% in 8 sessions on thin volume",
    aliases: ["nirmal biotech", "nirmal bio", "nirmalbio", "nirmal"],
  },
  {
    symbol: "TARANGTEL",
    name: "Tarang Telecom",
    exchange: "NSE",
    sector: "Telecom",
    group: "Meridian Group",
    aliases: ["tarang telecom", "tarang", "tarangtel"],
  },
  {
    symbol: "AAROHAN",
    name: "Aarohan Infra",
    exchange: "NSE",
    sector: "Construction",
    group: "Kaveri Group",
    aliases: ["aarohan infra", "aarohan"],
  },
  {
    symbol: "VEDANTRX",
    name: "Vedant Rx Pharma",
    exchange: "NSE",
    sector: "Pharma",
    aliases: ["vedant rx", "vedant pharma", "vedantrx"],
  },
  {
    symbol: "HIMGIRI",
    name: "Himgiri Cements",
    exchange: "NSE",
    sector: "Cement",
    group: "Kaveri Group",
    aliases: ["himgiri cements", "himgiri cement", "himgiri"],
  },
];

const d = (iso: string) => iso;

export const EVIDENCE: EvidenceDoc[] = [
  {
    id: "nse-kav-1107",
    symbol: "KAVERIPWR",
    source: "NSE filing",
    tier: 1,
    kind: "order_win",
    title: "Kaveri Power Systems: receipt of order (Reg 30)",
    text: "The Company has received a Letter of Award from a state transmission utility for a 400 kV substation package valued at Rs 420 crore, to be executed over 24 months.",
    publishedAt: d("2026-11-07"),
    url: "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
  },
  {
    id: "nse-kav-1030",
    symbol: "KAVERIPWR",
    source: "NSE filing",
    tier: 1,
    kind: "results",
    title: "Kaveri Power Systems: Q2 FY27 results",
    text: "Revenue from operations for the quarter was Rs 1,184 crore against Rs 1,020 crore in the corresponding quarter last year. Net profit was Rs 96 crore.",
    publishedAt: d("2026-10-30"),
    url: "https://www.nseindia.com/companies-listing/corporate-filings-financial-results",
  },
  {
    id: "nse-sur-1106",
    symbol: "SURYAFIN",
    source: "NSE filing",
    tier: 1,
    kind: "clarification",
    title: "Surya Fincap: clarification on news item (Reg 30(11))",
    text: "With reference to the news item regarding a proposed merger with a foreign bank, the Company clarifies that it is not in any discussion regarding such a proposal and there is no such information that requires disclosure.",
    publishedAt: d("2026-11-06"),
    url: "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
    denies: true,
  },
  {
    id: "sebi-sur-1102",
    symbol: "SURYAFIN",
    source: "NSE surveillance",
    tier: 2,
    kind: "rating",
    title: "Surya Fincap moved to ASM Stage II",
    text: "Securities shortlisted under Additional Surveillance Measure (ASM) Long Term Stage II: Surya Fincap.",
    publishedAt: d("2026-11-02"),
    url: "https://www.nseindia.com/reports/asm",
  },
  {
    id: "nse-mer-1104",
    symbol: "MERIDPORT",
    source: "NSE filing",
    tier: 1,
    kind: "dividend",
    title: "Meridian Ports & Logistics: interim dividend",
    text: "The Board has declared an interim dividend of Rs 7 per equity share of face value Rs 2 each. The record date is 20 November 2026.",
    publishedAt: d("2026-11-04"),
    url: "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
  },
  {
    id: "nse-mer-1101",
    symbol: "MERIDPORT",
    source: "NSE filing",
    tier: 1,
    kind: "acquisition",
    title: "Meridian Ports & Logistics: acquisition of a terminal operator",
    text: "The Company has entered into a share purchase agreement to acquire 100% of Coastline Terminals Private Limited for a consideration of Rs 1,350 crore.",
    publishedAt: d("2026-11-01"),
    url: "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
  },
  {
    id: "bse-nir-1105",
    symbol: "NIRMALBIO",
    source: "BSE filing",
    tier: 1,
    kind: "pledge",
    title: "Nirmal Biotech: creation of pledge by promoter (SAST)",
    text: "Promoter entity Nirmal Holdings has created a pledge on 31.2% of the total share capital of the Company, up from 12.0% previously.",
    publishedAt: d("2026-11-05"),
    url: "https://www.bseindia.com/corporates/ann.html",
  },
  {
    id: "nse-tar-1103",
    symbol: "TARANGTEL",
    source: "NSE filing",
    tier: 1,
    kind: "results",
    title: "Tarang Telecom: Q2 FY27 results",
    text: "Net loss for the quarter was Rs 212 crore compared with a net loss of Rs 305 crore in the corresponding quarter last year.",
    publishedAt: d("2026-11-03"),
    url: "https://www.nseindia.com/companies-listing/corporate-filings-financial-results",
  },
  {
    id: "nse-him-1108",
    symbol: "HIMGIRI",
    source: "NSE filing",
    tier: 1,
    kind: "bonus",
    title: "Himgiri Cements: outcome of board meeting, bonus issue",
    text: "The Board has recommended a bonus issue of equity shares in the ratio of 1:1, subject to shareholder approval.",
    publishedAt: d("2026-11-08"),
    url: "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
  },
];

export const DISCLOSURES: Record<string, Disclosure[]> = {
  SURYAFIN: [
    { date: "2026-11-06", kind: "Bulk deal", party: "Ridgeline Trading LLP", detail: "Sold 4,80,000 shares", source: "NSE bulk deals", url: "https://www.nseindia.com/report-detail/display-bulk-and-block-deals" },
    { date: "2026-11-05", kind: "Bulk deal", party: "Ridgeline Trading LLP", detail: "Bought 5,10,000 shares", source: "NSE bulk deals", url: "https://www.nseindia.com/report-detail/display-bulk-and-block-deals" },
    { date: "2026-11-04", kind: "Insider sale", party: "A promoter-group entity", detail: "Sold 1.4% of equity", source: "NSE insider trading (PIT)", url: "https://www.nseindia.com/companies-listing/corporate-filings-insider-trading" },
  ],
  NIRMALBIO: [
    { date: "2026-11-05", kind: "Pledge created", party: "Nirmal Holdings (promoter)", detail: "Pledge now 31.2% of equity, from 12.0%", source: "BSE SAST filing", url: "https://www.bseindia.com/corporates/ann.html" },
    { date: "2026-11-03", kind: "Bulk deal", party: "Peakview Ventures", detail: "Sold 2,20,000 shares", source: "BSE bulk deals", url: "https://www.bseindia.com/markets/equity/EQReports/bulk_deals.aspx" },
  ],
  KAVERIPWR: [
    { date: "2026-10-28", kind: "Insider purchase", party: "A director", detail: "Bought 12,000 shares", source: "NSE insider trading (PIT)", url: "https://www.nseindia.com/companies-listing/corporate-filings-insider-trading" },
  ],
};

/** Sample of the SEBI Research Analyst register (fictional numbers). */
export const RA_REGISTRY = new Map<string, string>([
  ["INH000017001", "Tattva Research Pvt Ltd"],
  ["INH000017002", "Anvay Equity Research"],
]);

/** Domains people expect from Indian brokers, AMCs, exchanges and regulators. */
export const TRUSTED_DOMAINS = [
  "zerodha.com",
  "groww.in",
  "upstox.com",
  "angelone.in",
  "icicidirect.com",
  "hdfcsec.com",
  "kotaksecurities.com",
  "nseindia.com",
  "bseindia.com",
  "sebi.gov.in",
  "amfiindia.com",
  "camsonline.com",
  "kfintech.com",
  "cdslindia.com",
  "nsdl.co.in",
];
