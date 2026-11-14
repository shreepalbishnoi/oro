import { AlertTriangle, CircleCheck, CircleHelp, Diamond, OctagonAlert, ShieldCheck, XCircle } from "lucide-react";
import type { ClaimLabel, RiskBand, Severity } from "@/lib/engine/types";

/** Colour never carries meaning alone: every state has an icon and a word. */
export const RISK: Record<RiskBand, { label: string; short: string; color: string; Icon: typeof AlertTriangle }> = {
  high: { label: "High risk", short: "High", color: "var(--red)", Icon: OctagonAlert },
  elevated: { label: "Be careful", short: "Careful", color: "var(--gold)", Icon: Diamond },
  low: { label: "Low risk", short: "Low", color: "var(--green)", Icon: ShieldCheck },
};

export const LABEL: Record<ClaimLabel, { label: string; color: string; Icon: typeof AlertTriangle }> = {
  supported: { label: "Supported", color: "var(--green)", Icon: CircleCheck },
  conflicting: { label: "Conflicting", color: "var(--red)", Icon: XCircle },
  unverified: { label: "Unverified", color: "var(--paper-dim)", Icon: CircleHelp },
};

export const SEV: Record<Severity, { label: string; color: string }> = {
  severe: { label: "Severe", color: "var(--red)" },
  medium: { label: "Medium", color: "var(--gold)" },
  info: { label: "Note", color: "var(--paper-dim)" },
};

export function Chip({ color, Icon, children, className }: { color: string; Icon?: typeof AlertTriangle; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.8rem] font-medium ${className ?? ""}`}
      style={{ color, borderColor: `color-mix(in oklab, ${color} 40%, transparent)`, background: `color-mix(in oklab, ${color} 9%, transparent)` }}
    >
      {Icon && <Icon aria-hidden="true" className="size-3.5" strokeWidth={2.2} />}
      {children}
    </span>
  );
}
