"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { usePathname } from "next/navigation";
import { FIELD_KEYS, stateFor, type FieldState } from "./chapters";
import { fragmentShader, vertexShader } from "./shader";
import { getFieldKarat, onFieldPulse, setFieldGeometry, setFieldLens, type PulseColor } from "@/lib/field-bus";

const INK_DARK = new THREE.Color(0.027, 0.039, 0.067); // sRGB values, set raw like the shader constants
const INK_LIGHT = new THREE.Color(0.965, 0.945, 0.902);

const PULSE: Record<PulseColor, THREE.Color> = {
  red: new THREE.Color("#FD373E"),
  green: new THREE.Color("#02D081"),
  gold: new THREE.Color("#FED32D"),
};

/** A section holds its state while it fills the viewport; between sections the states blend. */
type Anchor = { name: string; start: number; end: number };

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

/** Reads the [data-chapter] sections on the page and returns the blended target state. */
function useChapterTarget() {
  const anchors = useRef<Anchor[]>([]);
  const pathname = usePathname();

  useEffect(() => {
    const measure = () => {
      const y = window.scrollY;
      const vh = window.innerHeight;
      anchors.current = Array.from(document.querySelectorAll<HTMLElement>("[data-chapter]")).map((el) => {
        const r = el.getBoundingClientRect();
        const top = r.top + y;
        const half = Math.min(vh, r.height) / 2;
        return { name: el.dataset.chapter ?? "page", start: top + half, end: top + r.height - half };
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    const id = window.setInterval(measure, 1500); // late layout shifts
    return () => {
      ro.disconnect();
      window.clearInterval(id);
    };
  }, [pathname]);

  return (mobile: boolean, out: FieldState) => {
    const list = anchors.current;
    if (list.length === 0) return Object.assign(out, stateFor("page", mobile));
    const probe = window.scrollY + window.innerHeight * 0.5;
    let i = 0;
    while (i < list.length - 1 && list[i + 1].start <= probe) i++;
    const a = list[i];
    const b = list[i + 1];
    if (!b || probe <= a.end) return Object.assign(out, stateFor(a.name, mobile));
    const sa = stateFor(a.name, mobile);
    const sb = stateFor(b.name, mobile);
    const t = smooth(Math.min(1, Math.max(0, (probe - a.end) / Math.max(1, b.start - a.end))));
    for (const k of FIELD_KEYS) out[k] = sa[k] + (sb[k] - sa[k]) * t;
    return out;
  };
}

function makeUniforms() {
  return {
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2(0, 0) },
    uMouseOn: { value: 0 },
    uVel: { value: 0 },
    uMood: { value: 0.15 },
    uCenter: { value: new THREE.Vector2(0, 0) },
    uScale: { value: 0.8 },
    uSep: { value: 0 },
    uLift: { value: 0 },
    uLens: { value: 1 },
    uShatter: { value: 0 },
    uGrid: { value: 0 },
    uContour: { value: 0 },
    uFlare: { value: 1 },
    uDim: { value: 1 },
    uWob: { value: 0 },
    uCursor: { value: 0 },
    uKarat: { value: -1 },
    uPulseCol: { value: new THREE.Color("#FED32D") },
    uPulse: { value: 0 },
    uInk: { value: new THREE.Color(0.027, 0.039, 0.067) },
    uLight: { value: 0 },
  };
}

type Sim = {
  u: ReturnType<typeof makeUniforms>;
  cur: FieldState;
  goal: FieldState;
  mouse: { x: number; y: number; on: number; live: number };
  scroll: { last: number; vel: number };
  pulse: number;
  mv: THREE.Vector2;
};

/** Builds the full-screen quad imperatively; all per-frame state lives in one ref. */
function FieldPlane({ onReady }: { onReady?: () => void }) {
  const { scene, gl, camera } = useThree();
  const target = useChapterTarget();
  const sim = useRef<Sim | null>(null);

  useEffect(() => {
    const u = makeUniforms();
    const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: u, depthTest: false, depthWrite: false });
    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    let alive = true;
    // Compile off the main thread where KHR_parallel_shader_compile exists, then show.
    gl.compileAsync(mesh, camera, scene)
      .catch(() => undefined)
      .then(() => {
        if (!alive) return;
        scene.add(mesh);
        requestAnimationFrame(() => requestAnimationFrame(() => onReady?.()));
      });
    const s: Sim = {
      u,
      cur: stateFor("hero", window.innerWidth < 720),
      goal: stateFor("hero", window.innerWidth < 720),
      mouse: { x: 0, y: 0, on: 0, live: 0 },
      scroll: { last: window.scrollY, vel: 0 },
      pulse: 0,
      mv: new THREE.Vector2(),
    };
    sim.current = s;

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const h = window.innerHeight;
      s.mouse.x = (e.clientX - window.innerWidth / 2) / h;
      s.mouse.y = -(e.clientY - h / 2) / h;
      s.mouse.live = 1;
    };
    const onLeave = () => (s.mouse.live = 0);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    const off = onFieldPulse((c, strength) => {
      u.uPulseCol.value.copy(PULSE[c]);
      s.pulse = Math.min(1.5, strength);
    });
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      off();
      alive = false;
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      sim.current = null;
    };
  }, [scene, gl, camera, onReady]);

  useFrame((state, delta) => {
    const s = sim.current;
    if (!s) return;
    const { u } = s;
    const dt = Math.min(delta, 0.05);
    const w = state.size.width;
    const h = state.size.height;
    const mobile = w / h < 0.9 || w < 720;
    const pr = state.gl.getPixelRatio();
    u.uRes.value.set(w * pr, h * pr);
    u.uTime.value = state.clock.elapsedTime;

    target(mobile, s.goal);
    const k = 1 - Math.exp(-dt * 3.2); // viscous follow
    for (const key of FIELD_KEYS) s.cur[key] += (s.goal[key] - s.cur[key]) * k;
    const c = s.cur;

    const halfW = (w / h) * 0.5;
    u.uCenter.value.set(c.cx * halfW * 0.82, c.cy);
    setFieldGeometry({ cx: c.cx * halfW * 0.82, cy: c.cy, scale: c.scale, sep: c.sep, lift: c.lift, lens: c.lens });
    u.uScale.value = c.scale;
    u.uSep.value = c.sep;
    u.uLift.value = c.lift;
    u.uLens.value = c.lens;
    u.uShatter.value = c.shatter;
    u.uGrid.value = c.grid;
    u.uContour.value = c.contour;
    u.uFlare.value = c.flare;
    u.uDim.value = c.dim;
    u.uWob.value = c.wob;
    u.uCursor.value = c.cursor;
    u.uKarat.value = getFieldKarat();
    const light = document.documentElement.dataset.theme === "light";
    u.uLight.value += ((light ? 1 : 0) - u.uLight.value) * (1 - Math.exp(-dt * 6));
    u.uInk.value.lerpColors(INK_DARK, INK_LIGHT, u.uLight.value);

    // Scroll velocity → viscous ripple; the sign carries direction.
    const y = window.scrollY;
    const raw = (y - s.scroll.last) / Math.max(dt, 1e-3) / 2600;
    s.scroll.last = y;
    s.scroll.vel += (Math.max(-1, Math.min(1, raw)) - s.scroll.vel) * (1 - Math.exp(-dt * 5));
    u.uVel.value = s.scroll.vel;

    const m = s.mouse;
    m.on += (m.live - m.on) * (1 - Math.exp(-dt * 4));
    u.uMouse.value.lerp(s.mv.set(m.x, m.y), 1 - Math.exp(-dt * 10));
    u.uMouseOn.value = m.on;
    setFieldLens(u.uMouse.value.x, u.uMouse.value.y, m.on * c.cursor);

    s.pulse *= Math.exp(-dt * 1.8);
    u.uPulse.value = s.pulse;
  });

  return null;
}

/** Pauses rendering while the tab is hidden. */
function VisibilityPause() {
  const { setFrameloop } = useThree();
  useEffect(() => {
    const on = () => setFrameloop(document.hidden ? "never" : "always");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [setFrameloop]);
  return null;
}

export default function OverlapField({ onReady }: { onReady?: () => void }) {
  const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2) * (window.innerWidth < 720 ? 0.55 : 0.7);
  return (
    <Canvas
      dpr={dpr}
      gl={{ antialias: false, alpha: false, powerPreference: "high-performance", stencil: false, depth: false }}
      flat
      linear
      orthographic
      camera={{ position: [0, 0, 1] }}
      style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}
      aria-hidden="true"
    >
      <VisibilityPause />
      <FieldPlane onReady={onReady} />
    </Canvas>
  );
}
