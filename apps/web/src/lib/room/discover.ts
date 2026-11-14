/**
 * Discover panel (PLAN §9.5). Rules only, same items for everyone, fixed order.
 * Never ranks by returns, never suggests buying anything.
 */
import { ENTITIES, EVIDENCE } from "../fixtures/market";
import { EVENTS, FUNDS, STORIES } from "../fixtures/room";
import { byKey, entity, netWorth } from "./compute";

export function discover(storyId: string | null) {
  const story = STORIES.find((s) => s.id === storyId) ?? STORIES[0];
  const e = entity(story.symbol);

  const sameGroup = e.group ? ENTITIES.filter((x) => x.group === e.group && x.symbol !== e.symbol) : [];
  const sameSector = ENTITIES.filter((x) => x.sector === e.sector && x.symbol !== e.symbol && !sameGroup.includes(x));
  const connected = [
    ...sameGroup.map((x) => ({ symbol: x.symbol, name: x.name, why: `Same group · ${e.group}` })),
    ...sameSector.map((x) => ({ symbol: x.symbol, name: x.name, why: `Same industry · ${x.sector}` })),
  ].slice(0, 4);

  const funds = FUNDS.filter((f) => f.weights[e.symbol])
    .map((f) => ({ id: f.id, name: f.short, weight: f.weights[e.symbol], asOf: f.disclosed }))
    .sort((a, b) => b.weight - a.weight);

  const related = new Set([e.symbol, ...connected.map((c) => c.symbol)]);
  const events = EVENTS.filter((x) => related.has(x.symbol)).slice(0, 3);

  const group = e.group ? byKey("group").rows.find((r) => r.name === e.group) : undefined;
  const sector = byKey("sector").rows.find((r) => r.name === e.sector);

  const missed = EVIDENCE.filter((d) => connected.some((c) => c.symbol === d.symbol))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 3);

  return {
    story,
    entity: e,
    connected,
    funds,
    events,
    concentration: { group, sector, netWorth },
    missed,
  };
}
