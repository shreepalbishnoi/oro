import { ImageResponse } from "next/og";
import { loadVerdict } from "@/lib/server/verdicts";
import { MARK_PATHS } from "@/components/brand/oro-mark";

const RISK = {
  high: { label: "HIGH RISK", color: "#FD373E" },
  elevated: { label: "BE CAREFUL", color: "#FED32D" },
  low: { label: "LOW RISK", color: "#02D081" },
} as const;

/** The shareable hallmark card for a verdict (1200×630 PNG). */
export async function hallmarkCard(slug: string) {
  const v = (await loadVerdict(slug))?.verdict ?? null;
  const r = v ? RISK[v.risk] : RISK.elevated;
  const { red, green, lens, viewBox } = MARK_PATHS;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#070A11", color: "#F7F2E7", padding: 64, fontFamily: "serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <svg width="44" height="50" viewBox={viewBox}>
              <path d={red} fill="#FD373E" />
              <ellipse cx={green.cx} cy={green.cy} rx={green.rx} ry={green.ry} fill="#02D081" />
              <ellipse cx={lens.cx} cy={lens.cy} rx={lens.rx} ry={lens.ry} transform={`rotate(${lens.rotate} ${lens.cx} ${lens.cy})`} fill="#070A11" />
            </svg>
            <div style={{ fontSize: 30, letterSpacing: 10, fontFamily: "sans-serif" }}>ORO</div>
            <div style={{ fontSize: 20, color: "#8F8B82", marginLeft: 16, fontFamily: "sans-serif" }}>Parakh verdict</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 680 }}>
            <div style={{ display: "flex", fontSize: 26, color: r.color, letterSpacing: 4, fontFamily: "sans-serif" }}>{r.label}</div>
            <div style={{ display: "flex", fontSize: 42, lineHeight: 1.15 }}>{(v?.summary ?? "This verdict link is not valid.").slice(0, 160)}</div>
          </div>
          <div style={{ display: "flex", fontSize: 20, color: "#8F8B82", fontFamily: "sans-serif" }}>Checked against exchange filings and SEBI records · Information, not advice</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 380 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: 330,
              height: 330,
              borderRadius: 999,
              border: "6px solid #FED32D",
              boxShadow: "0 0 80px rgba(254,211,45,0.35)",
              transform: "rotate(-6deg)",
            }}
          >
            <div style={{ fontSize: 22, letterSpacing: 6, color: "#FED32D", fontFamily: "sans-serif" }}>ORO · ASSAYED</div>
            <div style={{ display: "flex", alignItems: "flex-start", fontSize: 140, color: "#FED32D", lineHeight: 1 }}>
              {v?.karat ?? "?"}
              <span style={{ fontSize: 40, marginTop: 18, marginLeft: 6 }}>KT</span>
            </div>
            <div style={{ fontSize: 20, letterSpacing: 4, color: r.color, fontFamily: "sans-serif" }}>OF 24 KARAT</div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
