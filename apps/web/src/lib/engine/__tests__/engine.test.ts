import { describe, expect, it } from "vitest";
import { assay } from "../assay";
import { adviceLeak, guard, isAdviceQuestion } from "../advice-filter";
import { karat, riskBand } from "../karat";
import { scrub } from "../scrub";
import { detectSignals, linkSignals } from "../signals";
import { decodeSlug, encodeSlug } from "../slug";
import { hamming, simhash } from "../trail";
import { SAMPLE_TIPS } from "../../fixtures/tips";
import type { Claim, Judgment, Signal } from "../types";

const ids = (s: Signal[]) => s.map((x) => x.id);

describe("scrub", () => {
  it("removes phone, PAN, email, Aadhaar, UPI", () => {
    const { redacted, removed } = scrub("Call 98765 43210 or +91 9876543210, PAN ABCDE1234F, mail a.b@gmail.com, aadhaar 2345 6789 0123, pay rich@ybl");
    expect(redacted).not.toMatch(/98765|ABCDE1234F|a\.b@gmail|2345 6789|rich@ybl/);
    expect(removed).toBeGreaterThanOrEqual(6);
  });
  it("leaves SEBI registration numbers intact", () => {
    expect(scrub("Reg INH000017001").redacted).toContain("INH000017001");
  });
});

describe("signals", () => {
  it("flags guaranteed returns in English and Hinglish", () => {
    expect(ids(detectSignals("Guaranteed returns of 40% every month", []))).toContain("guaranteed_returns");
    expect(ids(detectSignals("100% sure shot, paisa double", []))).toContain("guaranteed_returns");
  });
  it("flags urgency and secrecy", () => {
    const s = ids(detectSignals("Aaj hi lo! Operator news hai, kisi ko mat batana", []));
    expect(s).toContain("urgency");
    expect(s).toContain("secrecy");
  });
  it("flags SEBI claim without number, and registered + promise", () => {
    const s = ids(detectSignals("SEBI registered advisor. Assured returns 30%", []));
    expect(s).toContain("sebi_claim");
    expect(s).toContain("registered_promise");
  });
  it("flags look-alike, apk, shortener, private group links", () => {
    expect(ids(linkSignals("https://zerodha-premium.in/app.apk"))).toEqual(expect.arrayContaining(["link_apk", "link_lookalike"]));
    expect(ids(linkSignals("go bit.ly/abc"))).toContain("link_shortener");
    expect(ids(linkSignals("https://t.me/+abc"))).toContain("private_group");
    expect(ids(linkSignals("https://www.nseindia.com/x"))).toEqual([]);
  });
  it("does not treat amounts like Rs.420 as links", () => {
    expect(linkSignals("order of Rs.420 crore")).toEqual([]);
  });
});

describe("judge via assay", () => {
  it("catches the inflated order amount (10x)", () => {
    const v = assay(SAMPLE_TIPS[0].text);
    const conflict = v.judgments.find((j) => j.label === "conflicting");
    expect(conflict?.reason).toMatch(/420/);
    expect(conflict?.grounded).toBe(true);
    expect(v.risk).toBe("high");
    expect(v.karat).toBeLessThan(6);
  });
  it("uses the Reg 30(11) denial for the merger rumour", () => {
    const v = assay(SAMPLE_TIPS[1].text);
    expect(v.judgments.some((j) => j.label === "conflicting" && j.doc?.id === "nse-sur-1106")).toBe(true);
    expect(v.signals.map((s) => s.id)).toEqual(expect.arrayContaining(["surveillance", "sme_low_float"]));
  });
  it("supports a factual, filing-backed message", () => {
    const v = assay(SAMPLE_TIPS[2].text);
    expect(v.judgments.filter((j) => j.label === "supported").length).toBeGreaterThanOrEqual(2);
    expect(v.risk).toBe("low");
    expect(v.karat).toBeGreaterThanOrEqual(18);
  });
  it("never lets ORO's own prose advise", () => {
    for (const t of SAMPLE_TIPS) {
      const v = assay(t.text);
      const prose = [v.summary, ...v.signals.flatMap((s) => [s.title, s.detail]), ...v.judgments.map((j) => j.reason)];
      for (const p of prose) expect(adviceLeak(p), p).toBeNull();
    }
  });
});

describe("karat", () => {
  const claim = (id: string, over: Partial<Claim> = {}): Claim => ({ id, text: "x", kind: "corporate_event", numbers: [], hedging: false, attribution: "named", checkable: true, ...over });
  const j = (claimId: string, label: Judgment["label"], tier: 1 | 2 | 3 | 4 = 1): Judgment => ({ claimId, label, reason: "", grounded: true, confidence: 1, doc: { id: "d", source: "s", tier, title: "t", publishedAt: "2026-11-01", url: "u" } });

  it("follows the published formula", () => {
    const r = karat({ claims: [claim("a"), claim("b")], judgments: [j("a", "supported"), j("b", "supported")], signals: [], origin: "filing" });
    expect(r.parts).toMatchObject({ base: 12, evidence: 6, source: 3, language: 0, scam: 0 });
    expect(r.karat).toBe(21);
  });
  it("bounds evidence at ±9 and clamps to 0", () => {
    const claims = [claim("a"), claim("b"), claim("c")];
    const r = karat({ claims, judgments: claims.map((c) => j(c.id, "conflicting")), signals: [{ id: "guaranteed_returns", severity: "severe", title: "", detail: "" }], origin: "unknown" });
    expect(r.parts.evidence).toBe(-9);
    expect(r.karat).toBe(0);
  });
  it("caps at 23 unless every checkable claim is tier 1-2 supported", () => {
    const claims = [claim("a"), claim("b"), claim("c"), claim("d")];
    const r = karat({ claims, judgments: [j("a", "supported", 3), j("b", "supported", 3), j("c", "supported", 3), j("d", "supported", 3)], signals: [], origin: "filing" });
    expect(r.karat).toBeLessThanOrEqual(23);
  });
  it("risk band: severe → high, medium → elevated", () => {
    expect(riskBand({ claims: [], judgments: [], signals: [{ id: "urgency", severity: "medium", title: "", detail: "" }] })).toBe("elevated");
    expect(riskBand({ claims: [], judgments: [], signals: [] })).toBe("low");
  });
});

describe("advice filter", () => {
  it("blocks recommendations", () => {
    expect(adviceLeak("You should buy this stock")).not.toBeNull();
    expect(adviceLeak("Abhi kharid lo")).not.toBeNull();
    expect(guard("Records match. You should sell now.")).toBe("Records match.");
  });
  it("detects advice questions", () => {
    expect(isAdviceQuestion("Should I buy Kaveri Power?")).toBe(true);
    expect(isAdviceQuestion("kya mai bech du? should i sell")).toBe(true);
    expect(isAdviceQuestion("What did Kaveri file this week?")).toBe(false);
  });
});

describe("slug + trail", () => {
  it("round-trips", () => {
    const s = encodeSlug("hello world tip", "text");
    expect(decodeSlug(s)).toEqual({ text: "hello world tip", kind: "text" });
    expect(decodeSlug("zzz")).toBeNull();
  });
  it("near-duplicate forwards hash close together", () => {
    const a = simhash(SAMPLE_TIPS[0].text);
    const b = simhash(SAMPLE_TIPS[0].text.replace("aaj hi lo", "abhi lo"));
    const c = simhash(SAMPLE_TIPS[2].text);
    expect(hamming(a, b)).toBeLessThan(hamming(a, c));
  });
  it("shows the seeded trail for a known tip", () => {
    expect(assay(SAMPLE_TIPS[0].text).trail?.count).toBeGreaterThanOrEqual(214);
  });
});
