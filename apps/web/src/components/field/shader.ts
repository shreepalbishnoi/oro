export const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * The Overlap Field.
 * Two molten forms (red = bear story, green = bull story) drawn as 2.5D signed
 * distance fields. Their overlap is gold; the ink lens sits in the middle.
 * Chapter uniforms morph it into a storm of forwards, an assay grid and a
 * strongroom floor with contour lines.
 */
export const fragmentShader = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uMouseOn;
uniform float uVel;
uniform float uMood;

uniform vec2 uCenter;
uniform float uScale;
uniform float uSep;
uniform float uLift;
uniform float uLens;
uniform float uShatter;
uniform float uGrid;
uniform float uContour;
uniform float uFlare;
uniform float uDim;
uniform float uWob;
uniform float uCursor;
uniform float uKarat;

uniform vec3 uPulseCol;
uniform float uPulse;

uniform vec3 uInk;
uniform float uLight;
#define INK uInk
const vec3 RED   = vec3(0.992, 0.216, 0.243);
const vec3 GREEN = vec3(0.008, 0.816, 0.506);
const vec3 GOLD  = vec3(0.996, 0.827, 0.176);
const vec3 PAPER = vec3(0.969, 0.949, 0.906);

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}

// Cheap ellipse distance, good enough for soft molten shading.
float sdE(vec2 p, vec2 r) { return (length(p / r) - 1.0) * min(r.x, r.y); }

vec2 warp(vec2 q) {
  float t = uTime;
  return (vec2(fbm(q * 2.1 + vec2(t * 0.06, 0.0)), fbm(q * 2.1 - vec2(0.0, t * 0.05) + 5.2)) - 0.5) * (0.045 + uWob * 0.05 + abs(uVel) * 0.1);
}

// Signed distances to (red, green, lens) in screen units. The noise warp is
// computed once per pixel and passed in, which keeps the shader small and fast to compile.
vec3 fields(vec2 q, vec2 w) {
  float t = uTime;
  q += w;
  vec2 m = (q - uCenter) / uScale;
  float br = sin(t * 0.55) * 0.012;
  vec2 bob = uWob * vec2(sin(t * 1.3) * 0.04, cos(t * 1.7) * 0.05);

  vec2 rp = m - vec2(-uSep, uLift + uVel * 0.03) - vec2(0.0, 0.175) - bob;
  rp = rot(0.2) * rp;
  float dR = sdE(rp, vec2(0.445 + br, 0.30 - br * 0.5));

  vec2 gp = m - vec2(uSep, -uLift - uVel * 0.03) - vec2(-0.005, -0.145) + bob;
  float dG = sdE(gp, vec2(0.437 - br * 0.6, 0.333 + br * 0.4));

  vec2 lp = rot(0.157) * (m - vec2(0.006, 0.008) * (1.0 - uSep));
  float dL = sdE(lp, vec2(0.302, 0.178) * uLens);

  return vec3(dR, dG, dL) * uScale;
}

// Molten relief height: a dome that rises at the rim and rounds off inside.
// Saturating profile: steep at the rim, almost flat inside, so the SDF's centre cusp never shows.
float dome(float d) { return 1.0 - exp(min(d, 0.0) / (0.1 * uScale)); }

float heightOf(vec3 f) {
  float h = max(dome(f.x), dome(f.y));
  float lensIn = smoothstep(0.004, -0.004, f.z);
  return h * (1.0 - lensIn) - lensIn * 0.35 * dome(f.z);
}

float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  float t = uTime;

  // Cursor loupe: magnify the field under the pointer.
  vec2 dm = p - uMouse;
  float md = length(dm);
  float R = 0.13;
  float inLoupe = (1.0 - smoothstep(R * 0.92, R, md)) * uMouseOn * uCursor;
  vec2 q = mix(p, uMouse + dm * (0.62 + 0.38 * smoothstep(0.0, R, md)), inLoupe);

  vec2 w = warp(q);
  vec3 f = fields(q, w);
  float dR = f.x, dG = f.y, dL = f.z;
  float aa = 1.6 / uRes.y;

  float mR = smoothstep(aa, -aa, dR);
  float mG = smoothstep(aa, -aa, dG);
  float mL = smoothstep(aa, -aa, dL);
  float mBoth = mR * mG;

  // Background: ink with a whisper of the last close direction at the floor.
  vec3 bg = INK + mix(RED, GREEN, uMood * 0.5 + 0.5) * 0.018 * smoothstep(0.2, -0.6, p.y);
  bg += GOLD * 0.012 * (1.0 - length(p * vec2(0.6, 1.0)));

  // ── Molten shading
  vec2 e = vec2(1.5 / uRes.y, 0.0);
  float h0 = heightOf(f);
  float hx = heightOf(fields(q + e.xy, w)) - h0;
  float hy = heightOf(fields(q + e.yx, w)) - h0;
  vec3 n = normalize(vec3(-hx, -hy, e.x * 1.4));

  vec3 L1 = normalize(vec3(-0.5, 0.7, 0.55));
  vec3 L2 = normalize(vec3(uMouse - q, 0.45));
  float diff = 0.55 + 0.45 * max(dot(n, L1), 0.0);
  float spec = pow(max(dot(reflect(-L1, n), vec3(0.0, 0.0, 1.0)), 0.0), 36.0);
  float spec2 = pow(max(dot(reflect(-L2, n), vec3(0.0, 0.0, 1.0)), 0.0), 60.0) * uMouseOn;
  float env = 0.5 + 0.5 * sin(n.x * 5.0 + n.y * 3.0 + t * 0.25);
  float rim = pow(1.0 - n.z, 2.0);

  vec3 base = mix(RED * mR, GREEN, mG * (1.0 - mR));
  base = mix(base, GOLD, mBoth);
  float body = max(mR, mG);
  vec3 metal = base * (diff * 0.88 + env * 0.18) + (spec * 0.55 + spec2 * 0.5) * mix(base, PAPER, 0.65) + rim * base * 0.35;

  // Gold seam: emission around the overlap.
  float seam = exp(-max(max(dR, dG), 0.0) / (0.025 * uScale)) * uFlare;
  float seamCore = mBoth * (0.25 + 0.25 * sin(t * 1.4)) * uFlare;

  vec3 col = mix(bg, metal, body);
  col += GOLD * (seam * 0.22 + seamCore * 0.35) * (1.0 - mL);

  // Lens: deep ink well with a faint refracted gold rim.
  float lensRim = exp(-abs(dL) / (0.006 * uScale)) * body;
  vec3 lensCol = INK + GOLD * 0.03 * (1.0 - smoothstep(0.0, 0.3, -dL));
  col = mix(col, lensCol, mL);
  col += GOLD * lensRim * 0.18;

  // ── Storm of forwards: forms break into floating message bubbles.
  if (uShatter > 0.001) {
    float cs = 0.042;
    vec2 flow = vec2(t * 0.012, t * 0.035);
    vec2 g = (p + flow) / cs;
    vec2 id = floor(g);
    vec2 lc = fract(g) - 0.5;
    float r1 = hash(id), r2 = hash(id + 7.7);
    vec2 cc = (id + 0.5) * cs - flow;
    vec3 fc = fields(cc + (vec2(r1, r2) - 0.5) * 0.25 * uShatter, vec2(0.0));
    float inR = step(fc.x, 0.0), inG = step(fc.y, 0.0), inL = step(fc.z, 0.0);
    vec3 bc = mix(mix(PAPER * 0.55, RED, inR), GREEN, inG * (1.0 - inR));
    bc = mix(bc, GOLD, inR * inG);
    float occupied = max(inR, inG) * (1.0 - inL);
    float on = step(r1, mix(0.12, 0.72, occupied));
    float bob = sin(t * (1.0 + r2) + r1 * 6.28) * 0.06;
    float bd = sdBox(lc + vec2(0.0, bob), vec2(0.34 + r2 * 0.06, 0.18)) - 0.08;
    float bubble = smoothstep(0.03, -0.03, bd) * on;
    float lineY = smoothstep(0.03, 0.0, abs(lc.y + bob) - 0.02) * step(abs(lc.x) , 0.26) * bubble;
    vec3 sc = bg + bc * bubble * mix(0.28, 0.85, occupied) - lineY * 0.12;
    col = mix(col, sc, uShatter);
  }

  // ── Assay grid: gold dust settling on a lattice; ripples outward from the mark.
  if (uGrid > 0.001) {
    vec2 gg = p * 26.0;
    float dd = length(fract(gg) - 0.5);
    float wave = 0.5 + 0.5 * sin(length(p - uCenter) * 18.0 - t * 1.6);
    float k = uKarat < 0.0 ? 0.6 : uKarat / 24.0;
    float dots = smoothstep(0.09, 0.03, dd) * (0.12 + 0.5 * wave * k);
    float lines = smoothstep(0.012, 0.0, min(abs(fract(gg.x) - 0.5), abs(fract(gg.y) - 0.5))) * 0.025;
    col += GOLD * (dots * 0.35 + lines) * uGrid * (1.0 - body * 0.6);
  }

  // ── Strongroom floor: a perspective plane of gold contour lines inside the lens.
  if (uContour > 0.001) {
    float horizon = 0.08;
    float below = max(horizon - p.y, 0.0);
    float depth = 1.0 / (below + 0.06);
    vec2 P = vec2(p.x * depth, depth + t * 0.35);
    float hh = fbm(P * 0.22) * 2.2 + fbm(P * 0.08 + 3.0);
    float lvl = hh * 7.0;
    float w = fwidth(lvl);
    float line = 1.0 - smoothstep(0.0, w * 1.4, abs(fract(lvl) - 0.5) - 0.5 + w);
    float fade = smoothstep(0.0, 0.35, below) * smoothstep(9.0, 2.0, depth * 0.5);
    float sky = exp(-abs(p.y - horizon) * 14.0) * 0.12;
    float above = max(p.y - horizon, 0.0);
    float ceilD = 1.0 / (above + 0.08);
    vec2 C = vec2(p.x * ceilD, ceilD + t * 0.35);
    float ch = fbm(C * 0.25) * 6.0;
    float cw = fwidth(ch);
    float cline = (1.0 - smoothstep(0.0, cw * 1.4, abs(fract(ch) - 0.5) - 0.5 + cw)) * smoothstep(0.0, 0.4, above) * 0.35;
    vec3 vault = INK + GOLD * (line * fade * 0.42 + cline * 0.18 + sky);
    col = mix(col, vault, uContour * mL);
  }

  // Pulse wash (game answers, verdicts).
  col += uPulseCol * uPulse * 0.22 * exp(-max(min(dR, dG), 0.0) * 6.0);

  // Loupe ring.
  float ring = exp(-abs(md - R) * 320.0) * uMouseOn * uCursor;
  col += GOLD * ring * 0.55;

  // Vignette + dim.
  float vig = smoothstep(1.25, 0.25, length(p * vec2(0.85, 1.0)));
  col = mix(INK, col, uDim);
  col = mix(col * mix(0.72, 1.0, vig), mix(INK, col, mix(0.8, 1.0, vig)), uLight);

  gl_FragColor = vec4(col, 1.0);
}
`;
