import { ImageResponse } from "next/og";
import { MARK_PATHS } from "@/components/brand/oro-mark";

/** The ORO mark as a square PNG (icons, PWA). Gold overlap drawn as a second red path clipped by an inline mask. */
export function markImage(size: number, pad = 0.16) {
  const { red, green, lens, viewBox } = MARK_PATHS;
  const inner = Math.round(size * (1 - pad * 2));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#070A11" }}>
        <svg width={inner} height={inner} viewBox={viewBox}>
          <defs>
            <clipPath id="g">
              <ellipse cx={green.cx} cy={green.cy} rx={green.rx} ry={green.ry} />
            </clipPath>
          </defs>
          <path d={red} fill="#FD373E" />
          <ellipse cx={green.cx} cy={green.cy} rx={green.rx} ry={green.ry} fill="#02D081" />
          <path d={red} fill="#FED32D" clipPath="url(#g)" />
          <ellipse cx={lens.cx} cy={lens.cy} rx={lens.rx} ry={lens.ry} transform={`rotate(${lens.rotate} ${lens.cx} ${lens.cy})`} fill="#070A11" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
