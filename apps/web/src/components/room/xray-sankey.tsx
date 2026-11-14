"use client";

import { useMemo, useState } from "react";
import { sankey, sankeyLinkHorizontal, type SankeyLink, type SankeyNode } from "d3-sankey";
import { inr, netWorth, sankeyGraph } from "@/lib/room/compute";

export type N = { id: string; name: string; col: number; kind: "you" | "account" | "company" | "group" };
export type L = { source: string; target: string; value: number };

const COLOR: Record<N["kind"], string> = { you: "var(--gold)", account: "var(--paper-dim)", company: "var(--paper)", group: "var(--gold-soft)" };

/**
 * Look-through Sankey: you → demat/funds → companies → business groups.
 * Hover or focus a company to light every path your money takes to it.
 * `scale` lets the shock simulator resize flows live.
 */
export function XraySankey({
  height = 520,
  compact = false,
  scale = 1,
  highlight,
  onPick,
  labelSize = 13,
  data,
  total = netWorth,
}: {
  height?: number;
  compact?: boolean;
  scale?: number;
  highlight?: string;
  onPick?: (symbol: string) => void;
  labelSize?: number;
  /** Live Room passes its own graph and net worth; the demo uses the fixture graph. */
  data?: { nodes: N[]; links: L[] };
  total?: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const width = 960;
  const active = hover ?? highlight ?? null;

  const graph = useMemo(() => {
    const g = data ?? sankeyGraph();
    const layout = sankey<N, L>()
      .nodeId((d) => d.id)
      .nodeAlign((n) => (n as unknown as N).col)
      .nodeWidth(10)
      .nodePadding(compact ? 7 : 10)
      .nodeSort(null)
      .extent([
        [compact ? 4 : 10 * labelSize, 8],
        [width - (compact ? 4 : 14 * labelSize), height - 8],
      ]);
    return layout({
      nodes: g.nodes.map((n) => ({ ...n })),
      links: g.links.filter((l) => l.value > 0).map((l) => ({ ...l, value: l.value * scale })),
    });
  }, [height, compact, scale, labelSize, data]);

  // Label layout: spread labels apart within each column, hide labels on slivers too thin to
  // carry one (they show on hover), and shorten names that would run into the next column.
  const labels = useMemo(() => {
    const out = new Map<string, { y: number; show: boolean; name: string; value: boolean }>();
    const cols = new Map<number, typeof graph.nodes>();
    for (const n of graph.nodes) cols.set(n.col, [...(cols.get(n.col) ?? []), n]);
    const xs = [...cols.keys()].sort((a, b) => a - b).map((c) => Math.min(...cols.get(c)!.map((n) => n.x0 ?? 0)));
    const gap = labelSize * 1.2;
    for (const [col, nodes] of cols) {
      const labelLeft = col <= 1;
      const ci = [...cols.keys()].sort((a, b) => a - b).indexOf(col);
      const room = labelLeft ? (ci > 0 ? (nodes[0].x0 ?? 0) - (xs[ci - 1] + 10) - 16 : (nodes[0].x0 ?? 0) - 12) : (ci < xs.length - 1 ? xs[ci + 1] - (nodes[0].x1 ?? 0) - 16 : width - (nodes[0].x1 ?? 0) - 12);
      let last = -Infinity;
      for (const n of [...nodes].sort((a, b) => (a.y0 ?? 0) - (b.y0 ?? 0))) {
        const mid = ((n.y0 ?? 0) + (n.y1 ?? 0)) / 2;
        const h = (n.y1 ?? 0) - (n.y0 ?? 0);
        const y = Math.max(mid, last + gap);
        const fits = h >= labelSize * 0.55 || nodes.length <= 3;
        const show = fits && y - mid < labelSize * 1.6 && y < height - 4;
        if (show) last = y;
        const valueText = n.kind !== "you" ? inr((n.value ?? 0) / scale, { compact: true }) : "";
        const nameW = (s: string) => s.length * labelSize * 0.55;
        const valueW = valueText.length * labelSize * 0.85 * 0.62 + 6;
        let name = n.name;
        let value = n.kind !== "you";
        if (nameW(name) + (value ? valueW : 0) > room) value = false;
        if (nameW(name) > room) name = name.slice(0, Math.max(4, Math.floor(room / (labelSize * 0.55)) - 1)).trimEnd() + "…";
        out.set(n.id, { y, show, name, value });
      }
    }
    return out;
  }, [graph, labelSize, height, scale]);

  const lit = useMemo(() => {
    if (!active) return null;
    const s = new Set<SankeyLink<N, L>>();
    const up = (n: SankeyNode<N, L>) => n.targetLinks?.forEach((l) => {
      s.add(l);
      up(l.source as SankeyNode<N, L>);
    });
    const down = (n: SankeyNode<N, L>) => n.sourceLinks?.forEach((l) => {
      s.add(l);
      down(l.target as SankeyNode<N, L>);
    });
    const node = graph.nodes.find((n) => n.id === active);
    if (node) {
      up(node);
      down(node);
    }
    return s;
  }, [active, graph]);

  const path = sankeyLinkHorizontal();
  const activeNode = graph.nodes.find((n) => n.id === active);

  return (
    <figure className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label="How your money reaches each company: from you, through your demat account and funds, to companies and their business groups."
      >
        <defs>
          <linearGradient id="xr-lit" x1="0" x2="1">
            <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--gold-soft)" stopOpacity="0.6" />
          </linearGradient>
        </defs>
        <g fill="none">
          {graph.links.map((l, k) => {
            const on = lit?.has(l);
            const other = (l.target as N).id === "other";
            return (
              <path
                key={k}
                d={path(l) ?? undefined}
                stroke={on ? "url(#xr-lit)" : other ? "var(--ink-4)" : "var(--paper)"}
                strokeOpacity={on ? 0.85 : lit ? 0.04 : other ? 0.35 : 0.1}
                strokeWidth={Math.max(1, l.width ?? 1)}
                style={{ transition: "stroke-opacity 0.35s, stroke 0.35s, d 0.5s" }}
              />
            );
          })}
        </g>
        {graph.nodes.map((n) => {
          const h = Math.max(2, (n.y1 ?? 0) - (n.y0 ?? 0));
          const interactive = n.kind === "company" && n.id !== "other";
          const touches = lit ? [...lit].some((l) => (l.source as N).id === n.id || (l.target as N).id === n.id) : true;
          const dim = lit && n.id !== active && !touches;
          const labelLeft = n.col <= 1;
          return (
            <g
              key={n.id}
              tabIndex={interactive ? 0 : undefined}
              role={interactive ? "button" : undefined}
              aria-label={interactive ? `${n.name}: ${inr((n.value ?? 0) / scale)} total. Show paths.` : undefined}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(n.id)}
              onBlur={() => setHover(null)}
              onClick={() => interactive && onPick?.(n.id)}
              onKeyDown={(e) => interactive && (e.key === "Enter" || e.key === " ") && onPick?.(n.id)}
              className={interactive ? "cursor-pointer outline-none" : undefined}
              opacity={dim ? 0.3 : 1}
              style={{ transition: "opacity 0.35s" }}
            >
              <rect x={n.x0} y={n.y0} width={(n.x1 ?? 0) - (n.x0 ?? 0)} height={h} rx={3} fill={n.id === active ? "var(--gold)" : COLOR[n.kind]} />
              {!compact && (labels.get(n.id)?.show || n.id === active) && (
                <text
                  x={labelLeft ? (n.x0 ?? 0) - 8 : (n.x1 ?? 0) + 8}
                  y={n.id === active && !labels.get(n.id)?.show ? ((n.y0 ?? 0) + (n.y1 ?? 0)) / 2 : (labels.get(n.id)?.y ?? 0)}
                  dy="0.35em"
                  textAnchor={labelLeft ? "end" : "start"}
                  fill={n.id === active ? "var(--gold)" : "var(--paper-dim)"}
                  fontSize={labelSize}
                  fontFamily="var(--font-geist)"
                >
                  {n.id === active ? n.name : labels.get(n.id)?.name}
                  {(n.id === active ? n.kind !== "you" : labels.get(n.id)?.value) && (
                    <tspan fill="var(--mute)" fontFamily="var(--font-geist-mono)" fontSize={labelSize * 0.85} dx="6">
                      {inr((n.value ?? 0) / scale, { compact: true })}
                    </tspan>
                  )}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-3 min-h-[2.5rem] text-[0.85rem] text-paper-dim" aria-live="polite">
        {activeNode && activeNode.kind === "company" && activeNode.id !== "other" ? (
          <>
            <span className="text-gold">{activeNode.name}</span>: {inr((activeNode.value ?? 0) / scale)} (
            {(((activeNode.value ?? 0) / scale / total) * 100).toFixed(1)}% of net worth) through {(activeNode.targetLinks ?? []).map((l) => (l.source as N).name).join(", ")}.
          </>
        ) : (
          <>Hover or tab to a company to trace every path your money takes to it.</>
        )}
      </figcaption>
    </figure>
  );
}
