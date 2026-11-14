/**
 * Tiny event bus between the DOM and the Overlap Field.
 * Components call `pulseField("green")` after a correct answer, a verdict, etc.
 */
export type PulseColor = "red" | "green" | "gold";

type Listener = (c: PulseColor, strength: number) => void;
const listeners = new Set<Listener>();

export function pulseField(color: PulseColor, strength = 1) {
  listeners.forEach((l) => l(color, strength));
}

export function onFieldPulse(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Karat (0–24) currently on screen; drives gold intensity in the assay grid. */
let karat = -1;
export function setFieldKarat(k: number) {
  karat = k;
}
export function getFieldKarat() {
  return karat;
}

/**
 * The mark's current geometry (written by the field every frame), so the DOM can tell which
 * part of the logo the cursor is over. Mirrors `fields()` in components/field/shader.ts
 * without the noise warp, which moves edges by under 1% of the screen.
 */
type Geometry = { cx: number; cy: number; scale: number; sep: number; lift: number; lens: number };
let geom: Geometry | null = null;
export function setFieldGeometry(g: Geometry) {
  geom = g;
}

export function getFieldGeometry() {
  return geom;
}

/** The cursor loupe as the shader draws it: centre in field units, strength 0–1. */
let lens = { x: 0, y: 0, on: 0 };
export function setFieldLens(x: number, y: number, on: number) {
  lens = { x, y, on };
}
export function getFieldLens() {
  return lens;
}
/** Loupe radius in units of viewport height (`R` in shader.ts). */
export const LENS_R = 0.13;
