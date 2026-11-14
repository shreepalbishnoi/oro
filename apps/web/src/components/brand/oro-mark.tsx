import { useId } from "react";

/**
 * The ORO mark, hand-vectorised from docs/assets/logo.png.
 * Red form (bear story) over green form (bull story); where they overlap is gold
 * (the truth); the ink lens sits in the centre.
 */
export const MARK_PATHS = {
  viewBox: "340 205 580 660",
  red: "M470 232C600 214 805 214 872 262C934 306 908 404 823 512C781 570 741 619 690 632C600 643 502 631 468 611C398 580 350 520 350 440C350 332 398 254 470 232Z",
  green: { cx: 625, cy: 640, rx: 275, ry: 210 },
  lens: { cx: 632, cy: 535, rx: 190, ry: 112, rotate: -9 },
} as const;

export function OroMark({
  className,
  title = "ORO",
  decorative = false,
}: {
  className?: string;
  title?: string;
  decorative?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const { red, green, lens, viewBox } = MARK_PATHS;
  return (
    <svg
      viewBox={viewBox}
      className={className}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : title}
    >
      <defs>
        <clipPath id={`g-${id}`}>
          <ellipse cx={green.cx} cy={green.cy} rx={green.rx} ry={green.ry} />
        </clipPath>
      </defs>
      <path d={red} fill="var(--red, #FD373E)" />
      <ellipse cx={green.cx} cy={green.cy} rx={green.rx} ry={green.ry} fill="var(--green, #02D081)" />
      <path d={red} fill="var(--gold, #FED32D)" clipPath={`url(#g-${id})`} />
      <ellipse
        cx={lens.cx}
        cy={lens.cy}
        rx={lens.rx}
        ry={lens.ry}
        transform={`rotate(${lens.rotate} ${lens.cx} ${lens.cy})`}
        fill="var(--ink, #070A11)"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <OroMark className="h-7 w-auto" decorative />
      <span className="font-sans text-[1.05rem] font-semibold tracking-[0.28em] text-paper">ORO</span>
    </span>
  );
}
