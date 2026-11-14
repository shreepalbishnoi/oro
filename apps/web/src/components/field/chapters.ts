/**
 * Chapter states for the Overlap Field. Every section that should steer the
 * background carries `data-chapter="<name>"`; the controller blends between
 * the states of neighbouring sections as their centres pass the viewport
 * centre, so scrolling up plays every morph in reverse.
 */
export type FieldState = {
  cx: number; // mark centre, as a fraction of the half-width (−1 left … 1 right)
  cy: number; // mark centre, in screen-height units (−0.5 … 0.5, up is +)
  scale: number; // mark height in screen heights
  sep: number; // red ↔ green horizontal pull-apart
  lift: number; // red ↑ / green ↓ pull-apart
  lens: number; // lens size multiplier (≫1 fills the screen)
  shatter: number; // 0 solid molten forms … 1 a storm of forwards
  grid: number; // assay grid of gold dust
  contour: number; // strongroom floor with gold contour lines
  flare: number; // gold seam glow
  dim: number; // overall brightness, so copy stays readable
  wob: number; // playful bobbing
  cursor: number; // cursor loupe strength
};

export type ChapterName =
  | "hero"
  | "noise"
  | "split"
  | "parakh"
  | "room"
  | "play"
  | "rules"
  | "cta"
  | "page"
  | "assay"
  | "vault"
  | "still";

const base: FieldState = {
  cx: 0,
  cy: 0,
  scale: 0.8,
  sep: 0,
  lift: 0,
  lens: 1,
  shatter: 0,
  grid: 0,
  contour: 0,
  flare: 1,
  dim: 1,
  wob: 0,
  cursor: 0,
};

type Def = { desktop: Partial<FieldState>; mobile?: Partial<FieldState> };

const DEFS: Record<ChapterName, Def> = {
  hero: {
    desktop: { cx: 0.56, cy: -0.01, scale: 0.72, flare: 1.15, cursor: 1 },
    mobile: { cx: 0, cy: 0.25, scale: 0.36, dim: 0.85, cursor: 0.6 },
  },
  noise: {
    desktop: { cx: 0, cy: 0, scale: 1.25, shatter: 1, flare: 0.25, dim: 0.62 },
    mobile: { scale: 0.8, shatter: 1, dim: 0.55, flare: 0.2 },
  },
  split: {
    desktop: { cx: 0, cy: -0.02, scale: 0.78, sep: 0.62, lift: 0.04, flare: 1.6, dim: 0.85 },
    mobile: { cy: 0.06, scale: 0.42, sep: 0.42, lift: 0.14, flare: 1.5, dim: 0.7 },
  },
  parakh: {
    desktop: { cx: 0.62, cy: 0.16, scale: 0.6, sep: 0.06, grid: 1, flare: 1.3, dim: 0.5 },
    mobile: { cx: 0, cy: 0.36, scale: 0.26, grid: 1, dim: 0.45 },
  },
  room: {
    desktop: { cx: 0, cy: 0, scale: 0.9, lens: 9, contour: 1, flare: 0.6, dim: 0.8 },
    mobile: { scale: 0.6, lens: 12, contour: 1, dim: 0.65 },
  },
  play: {
    desktop: { cx: -0.62, cy: -0.3, scale: 0.4, wob: 1, flare: 1, dim: 0.6 },
    mobile: { cx: 0, cy: 0.38, scale: 0.26, wob: 1, dim: 0.4 },
  },
  rules: {
    desktop: { cx: -0.7, cy: -0.3, scale: 0.55, contour: 0.25, flare: 0.5, dim: 0.32 },
    mobile: { cx: 0, cy: -0.4, scale: 0.4, dim: 0.28 },
  },
  cta: {
    desktop: { cx: 0, cy: 0.06, scale: 0.92, flare: 1.9, dim: 0.9, cursor: 1 },
    mobile: { cy: 0.16, scale: 0.46, flare: 1.7, dim: 0.75 },
  },
  // Quieter presets for inner pages.
  page: {
    desktop: { cx: 0.78, cy: 0.18, scale: 0.6, dim: 0.42, flare: 0.8 },
    mobile: { cx: 0.3, cy: 0.4, scale: 0.35, dim: 0.32 },
  },
  assay: {
    desktop: { cx: 0.74, cy: 0.1, scale: 0.55, grid: 1, flare: 1.1, dim: 0.5 },
    mobile: { cx: 0, cy: 0.42, scale: 0.28, grid: 1, dim: 0.35 },
  },
  vault: {
    desktop: { cx: 0, cy: 0, scale: 0.9, lens: 9, contour: 1, flare: 0.4, dim: 0.42 },
    mobile: { lens: 12, contour: 1, dim: 0.35 },
  },
  still: {
    desktop: { cx: 0.8, cy: -0.2, scale: 0.5, dim: 0.25, flare: 0.4 },
    mobile: { cx: 0.2, cy: -0.42, scale: 0.3, dim: 0.22 },
  },
};

export function stateFor(name: string, mobile: boolean): FieldState {
  const def = DEFS[name as ChapterName] ?? DEFS.page;
  return { ...base, ...def.desktop, ...(mobile ? def.mobile : undefined) };
}

export const FIELD_KEYS = Object.keys(base) as (keyof FieldState)[];
