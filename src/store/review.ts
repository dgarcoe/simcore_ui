// Reviewing a recorded run: how it evolved (series per tick, days), what each
// agent did and why, where people walked and fought, and two runs side by side.
// Pure functions over the run's events, so they are cheap to test.

import type { SimEvent, SimState } from '../api/types';
import type { Moment } from './story';

type Data = Record<string, unknown>;
const str = (v: unknown) => String(v ?? '').trim();
const end = (e: SimEvent) => e.data as Partial<SimState>;

// ── Series: territories and points over time ─────────────────────────────

export interface GroupSeries {
  color: string;
  territories: number[];
  points: number[];
}

export interface Series {
  /** Ticks with a value (the end of each tick). */
  ticks: number[];
  groups: Record<string, GroupSeries>;
  /** Points of the agents who ended in the top places, by tick. */
  agents: Record<string, number[]>;
}

const TOP_AGENTS = 5;

export function seriesOf(events: SimEvent[]): Series {
  const ends = events.filter((e) => e.type === 'tick_end');
  const ticks = ends.map((e) => e.tick);
  const groups: Record<string, GroupSeries> = {};
  const points: Array<Record<string, number>> = [];
  ends.forEach((e, i) => {
    const d = end(e);
    const factions = d.society?.factions ?? {};
    const held: Record<string, number> = {};
    for (const t of Object.values(d.territories ?? {})) if (t.owner) held[t.owner] = (held[t.owner] ?? 0) + 1;
    const gp = Object.fromEntries((d.scores?.groups ?? []).map((g) => [g.group, g.points]));
    for (const name of new Set([...Object.keys(held), ...Object.keys(gp)])) {
      const g = (groups[name] ??= { color: '', territories: new Array(ends.length).fill(0), points: new Array(ends.length).fill(0) });
      g.color ||= factions[name]?.color ?? '';
      g.territories[i] = held[name] ?? 0;
      g.points[i] = gp[name] ?? 0;
    }
    points.push(Object.fromEntries((d.scores?.ranking ?? []).map((r) => [r.agent, r.points])));
  });
  const last = points.at(-1) ?? {};
  const top = Object.entries(last)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_AGENTS)
    .map(([n]) => n);
  const agents = Object.fromEntries(top.map((n) => [n, points.map((p) => p[n] ?? 0)]));
  return { ticks, groups, agents };
}

// ── Days ─────────────────────────────────────────────────────────────────

export interface Day {
  day: number;
  start: number;
  end: number;
}

/** Days from the clock text at the end of each tick ("Day 2, 06:00"; "Day 2, 00:00" ends day 1). */
export function daysOf(times: Record<number, string>): Day[] {
  const days = new Map<number, Day>();
  for (const [t, time] of Object.entries(times)) {
    const m = /(\d+)/.exec(time);
    if (!m) continue;
    // a tick that ends at midnight closes its day
    const day = Number(m[1]) - (/\b00:00\b/.test(time) && Number(m[1]) > 1 ? 1 : 0);
    const tick = Number(t);
    const d = days.get(day);
    if (!d) days.set(day, { day, start: tick, end: tick });
    else {
      d.start = Math.min(d.start, tick);
      d.end = Math.max(d.end, tick);
    }
  }
  return [...days.values()].sort((a, b) => a.day - b.day);
}

export interface DayRecap {
  day: number;
  from: number;
  to: number;
  groups: Array<{ group: string; points: number; gained: number; territories: number }>;
  people: Array<{ agent: string; points: number; gained: number }>;
  moments: Moment[];
  counts: { knockouts: number; deaths: number; captures: number };
}

/** What a day brought, for everybody: groups, people who rose most, its key moments. */
export function dayRecap(events: SimEvent[], moments: Moment[], day: Day): DayRecap {
  const ends = events.filter((e) => e.type === 'tick_end');
  const at = ends.filter((e) => e.tick <= day.end).at(-1);
  const before = ends.filter((e) => e.tick < day.start).at(-1);
  const now = at ? end(at) : {};
  const prev = before ? end(before) : {};
  const prevGroup = Object.fromEntries((prev.scores?.groups ?? []).map((g) => [g.group, g.points]));
  const prevPoints = Object.fromEntries((prev.scores?.ranking ?? []).map((r) => [r.agent, r.points]));
  const held: Record<string, number> = {};
  for (const t of Object.values(now.territories ?? {})) if (t.owner) held[t.owner] = (held[t.owner] ?? 0) + 1;
  const inDay = (e: { tick: number }) => e.tick >= day.start && e.tick <= day.end;
  const dayEvents = events.filter(inDay);
  return {
    day: day.day,
    from: day.start,
    to: day.end,
    groups: (now.scores?.groups ?? []).map((g) => ({
      group: g.group,
      points: g.points,
      gained: g.points - (prevGroup[g.group] ?? 0),
      territories: held[g.group] ?? 0,
    })),
    people: (now.scores?.ranking ?? [])
      .map((r) => ({ agent: r.agent, points: r.points, gained: r.points - (prevPoints[r.agent] ?? 0) }))
      .sort((a, b) => b.gained - a.gained || b.points - a.points)
      .slice(0, 5),
    moments: moments
      .filter(inDay)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 6)
      .sort((a, b) => a.tick - b.tick),
    counts: {
      knockouts: dayEvents.filter((e) => e.type === 'agent_knockout').length,
      deaths: dayEvents.filter((e) => e.type === 'agent_death').length,
      captures: dayEvents.filter((e) => e.type === 'territory_change' && !e.data.contested && e.data.owner !== e.data.previous).length,
    },
  };
}

// ── Moments: categories for filtering the timeline ───────────────────────

export const CATEGORIES: Array<[string, string]> = [
  ['fights', '⚔ Peleas'],
  ['deaths', '💀 Muertes'],
  ['turf', '🏴 Territorios'],
  ['items', '💰 Objetos'],
  ['groups', '👥 Grupos'],
  ['story', '📖 Historia'],
];

/** The scenario's actions that hurt someone else: steal, kill, harm or put a condition on them. */
export function hostileActions(cfg: { actions?: Record<string, { target?: string; on_target?: { steal?: string; kill?: boolean; health?: number; add_conditions?: string[] } }> } | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const [name, a] of Object.entries(cfg?.actions ?? {})) {
    const o = a.on_target;
    if ((a.target === 'agent' || a.target === undefined) && o && (o.steal || o.kill || (o.health ?? 0) < 0 || o.add_conditions?.length)) out.add(name);
  }
  return out;
}

export function categoryOf(m: Moment, hostile: Set<string> = new Set()): string {
  switch (m.kind) {
    case 'agent_death':
      return 'deaths';
    case 'agent_knockout':
    case 'dice_roll':
    case 'item_fuse':
      return 'fights';
    case 'agent_action':
      return (m.action && hostile.has(m.action)) || / ataca a /.test(m.text) ? 'fights' : 'story';
    case 'territory_change':
      return 'turf';
    case 'item_transfer':
      return 'items';
    case 'faction_change':
    case 'vote_result':
      return 'groups';
    default:
      return 'story';
  }
}

export interface MomentFilter {
  /** Categories hidden from the timeline. */
  hidden: string[];
  /** Only moments where this agent takes part. */
  agent?: string | null;
  /** Only moments of this group's members (or its territories). */
  group?: string | null;
}

export function filterMoments(moments: Moment[], f: MomentFilter, members: string[] = [], hostile: Set<string> = new Set()): Moment[] {
  return moments.filter((m) => {
    if (f.hidden.includes(categoryOf(m, hostile))) return false;
    if (f.agent && !m.agents.includes(f.agent)) return false;
    if (f.group && !m.agents.some((a) => members.includes(a)) && !m.text.includes(f.group)) return false;
    return true;
  });
}

// ── An agent through the run ─────────────────────────────────────────────

export interface TrailItem {
  icon: string;
  text: string;
  /** Why (the agent's reasoning), or more detail. */
  why?: string;
  tone?: 'good' | 'bad';
}

export interface TrailTick {
  tick: number;
  time: string;
  place: string;
  points?: number;
  items: TrailItem[];
  /** The prompt and raw answer of its decision (runs recorded with llm.record_prompts). */
  trace?: { system: string; prompt: string; answer: string };
}

const ACTION_ICON: Record<string, string> = {
  move: '🚶',
  speak: '💬',
  attack: '🗡',
  wait: '⏳',
  rest: '💤',
  work: '🔨',
  trade: '🤝',
  give: '🎁',
  take: '✋',
  custom: '✨',
};

/** Everything that happened to one agent, tick by tick: what it did and why, rolls, points, orders. */
export function agentTrail(events: SimEvent[], name: string, times: Record<number, string> = {}): TrailTick[] {
  const rows = new Map<number, TrailTick>();
  let place = '';
  let points: number | undefined;
  const row = (tick: number) => {
    let r = rows.get(tick);
    if (!r) rows.set(tick, (r = { tick, time: times[tick] ?? '', place, items: [] }));
    return r;
  };
  for (const e of events) {
    const d = (e.data ?? {}) as Data;
    const who = str(d.agent ?? e.source);
    const mine = who === name;
    switch (e.type) {
      case 'tick_end': {
        const a = Object.values(end(e).agents ?? {}).find((x) => x.name === name);
        if (a) place = a.location;
        const r = (end(e).scores?.ranking ?? []).find((x) => x.agent === name);
        if (r) points = r.points;
        const existing = rows.get(e.tick);
        if (existing) {
          existing.place = place;
          existing.points = points;
        }
        break;
      }
      case 'agent_action':
      case 'agent_move':
      case 'agent_speak':
        if (e.source === name) {
          const failed = d.success === false || (d.action_type === 'attack' && d.hit === false) || !!d.exhausted;
          row(e.tick).items.push({
            icon: d.exhausted ? '😵' : (ACTION_ICON[str(d.action_type)] ?? '•'),
            text: d.exhausted ? 'Cae rendido: sin energía, solo puede descansar' : str(d.action) || str(d.action_type),
            why: str(d.reasoning) || undefined,
            tone: failed ? 'bad' : undefined,
          });
        } else if (str(d.target) === name && (d.action_type === 'attack' || d.action_type === 'custom' || d.action_type === 'speak')) {
          row(e.tick).items.push({ icon: d.action_type === 'speak' ? '👂' : '⚠', text: `${e.source}: ${str(d.action)}`, tone: d.action_type === 'speak' ? undefined : 'bad' });
        }
        break;
      case 'dice_roll':
        if (mine)
          row(e.tick).items.push({
            icon: '🎲',
            text: `${str(d.check).replace(/_/g, ' ')}: ${str(d.total)}${d.target ? ` contra ${str(d.target)}` : ''}`,
            tone: d.critical ? 'good' : d.fumble ? 'bad' : undefined,
          });
        break;
      case 'score_change':
        if (mine) {
          const p = Number(d.points ?? 0);
          row(e.tick).items.push({ icon: '🏆', text: `${p >= 0 ? '+' : ''}${p} «${str(d.description || d.achievement)}»`, tone: p >= 0 ? 'good' : 'bad' });
        }
        break;
      case 'orders':
        if (mine) row(e.tick).items.push({ icon: d.kind === 'red_line' ? '⛔' : '📜', text: d.kind === 'red_line' ? `Su línea roja le frena: no ${str(d.text)}` : `Se activa su plan: ${str(d.text)}` });
        break;
      case 'agent_knockout':
        if (mine) row(e.tick).items.push({ icon: '💫', text: `Queda K.O.${d.cause ? ` (${str(d.cause)})` : ''}`, tone: 'bad' });
        break;
      case 'agent_death':
        if (mine) row(e.tick).items.push({ icon: '💀', text: `Muere${d.cause ? ` (${str(d.cause)})` : ''}`, tone: 'bad' });
        break;
      case 'item_transfer':
        if (str(d.to) === name || str(d.from) === name) {
          const gets = str(d.to) === name;
          const other = gets ? str(d.from) : str(d.to);
          const verb = d.kind === 'steal' ? (gets ? 'roba' : 'le roban') : gets ? 'recibe' : 'da';
          row(e.tick).items.push({ icon: gets ? '➕' : '➖', text: `${verb} ${str(d.amount) || ''} ${str(d.item)}${other && !other.includes(':') ? ` (${other})` : ''}`.replace(/\s+/g, ' '), tone: d.kind === 'steal' && !gets ? 'bad' : undefined });
        }
        break;
      case 'condition_change':
        if (mine) row(e.tick).items.push({ icon: d.change === 'removed' ? '✓' : '⚕', text: `${d.change === 'removed' ? 'Se le pasa' : 'Ahora'}: ${str(d.condition)}`, why: str(d.cause) || undefined });
        break;
      case 'faction_change':
        if (mine) row(e.tick).items.push({ icon: '👥', text: `${str(d.change)}: ${str(d.faction)}` });
        break;
      case 'decision_trace':
        if (mine) row(e.tick).trace = { system: str(d.system), prompt: str(d.prompt), answer: str(d.answer) };
        break;
    }
  }
  return [...rows.values()].filter((r) => r.items.length || r.trace).sort((a, b) => a.tick - b.tick);
}

/** Whether the recording kept the prompts of the decisions. */
export function hasTraces(events: SimEvent[]): boolean {
  return events.some((e) => e.type === 'decision_trace');
}

// ── Map layers: an agent's path, where the fights were ───────────────────

/** Places an agent went through up to a tick, in order (consecutive repeats merged). */
export function pathOf(events: SimEvent[], name: string, upTo: number): string[] {
  const out: string[] = [];
  for (const e of events) {
    if (e.tick > upTo) break;
    if (e.type !== 'tick_end') continue;
    const a = Object.values(end(e).agents ?? {}).find((x) => x.name === name);
    if (a && a.location !== out.at(-1)) out.push(a.location);
  }
  return out;
}

/** Fights per place up to a tick: attacks, knockouts and deaths. */
export function fightHeat(events: SimEvent[], upTo: number, hostile: Set<string> = new Set()): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (place: unknown) => {
    const p = str(place);
    if (p) out[p] = (out[p] ?? 0) + 1;
  };
  for (const e of events) {
    if (e.tick > upTo) break;
    const d = (e.data ?? {}) as Data;
    if (e.type === 'agent_action' && (d.action_type === 'attack' || (d.success !== false && hostile.has(str(d.name))))) add(d.location);
    else if (e.type === 'agent_knockout' || e.type === 'agent_death') add(d.location);
  }
  return out;
}

// ── Two runs side by side ────────────────────────────────────────────────

export interface RunSummary {
  name: string;
  ticks: number;
  ending: string;
  winner: string;
  mvp: string;
  model: string;
  actions: Array<[string, number]>;
  /** Useful decisions: not a wait or a failed parse. */
  useful: number;
  decisions: number;
  parseErrors: number;
  knockouts: number;
  deaths: number;
  captures: number;
  /** Mean points by the style of the orders agents followed. */
  styles: Record<string, number>;
  groups: Array<{ group: string; points: number }>;
  top: Array<{ agent: string; points: number }>;
}

export function summarizeRun(
  name: string,
  events: SimEvent[],
  config?: { agents?: Array<{ name: string; orders?: { style?: string } }>; llm?: { model?: string } } | null,
  model = '',
): RunSummary {
  const last = events.at(-1);
  const endData = (events.find((e) => e.type === 'simulation_end')?.data ?? {}) as Data;
  const finalState = end(events.filter((e) => e.type === 'tick_end').at(-1) ?? ({ data: {} } as SimEvent));
  const acts: Record<string, number> = {};
  let useful = 0;
  let decisions = 0;
  let parseErrors = 0;
  for (const e of events) {
    if (e.type !== 'agent_action' && e.type !== 'agent_move' && e.type !== 'agent_speak') continue;
    const d = e.data as Data;
    const key = str(d.name) || str(d.action_type);
    acts[key] = (acts[key] ?? 0) + 1;
    decisions++;
    if (/^Parse error|LLM failed/.test(str(d.reasoning))) parseErrors++;
    else if (d.action_type !== 'wait') useful++;
  }
  const style = Object.fromEntries((config?.agents ?? []).map((a) => [a.name, a.orders?.style ?? '']));
  const byStyle: Record<string, number[]> = {};
  for (const r of finalState.scores?.ranking ?? []) if (style[r.agent]) (byStyle[style[r.agent]] ??= []).push(r.points);
  return {
    name,
    ticks: last?.tick ?? 0,
    ending: str(endData.message),
    winner: str(endData.winner),
    mvp: str(endData.mvp),
    model: model || ((endData.llm_stats as Data | undefined)?.mode === 'demo' ? 'demo (sin LLM)' : str(config?.llm?.model)),
    actions: Object.entries(acts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8),
    useful,
    decisions,
    parseErrors,
    knockouts: events.filter((e) => e.type === 'agent_knockout').length,
    deaths: events.filter((e) => e.type === 'agent_death').length,
    captures: events.filter((e) => e.type === 'territory_change' && !e.data.contested && e.data.owner !== e.data.previous).length,
    styles: Object.fromEntries(Object.entries(byStyle).map(([k, v]) => [k, Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10])),
    groups: finalState.scores?.groups ?? [],
    top: (finalState.scores?.ranking ?? []).slice(0, 5),
  };
}

// ── Links to a moment ────────────────────────────────────────────────────

export interface ReplayLink {
  /** A replay file (`fixtures/…json`) or a recorded run's id. */
  file?: string;
  run?: string;
  tick?: number;
  agent?: string;
}

export function parseReplayHash(hash: string): ReplayLink | null {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const file = q.get('replay') ?? undefined;
  const run = q.get('run') ?? undefined;
  if (!file && !run) return null;
  const t = q.get('t');
  return { file, run, tick: t !== null && t !== '' ? Number(t) : undefined, agent: q.get('agente') ?? undefined };
}

export function replayHash(link: ReplayLink): string {
  const q = new URLSearchParams();
  if (link.file) q.set('replay', link.file);
  if (link.run) q.set('run', link.run);
  if (link.tick !== undefined) q.set('t', String(link.tick));
  if (link.agent) q.set('agente', link.agent);
  return `#${q.toString()}`;
}

// ── Following an item: whose hands and which places it went through ──────

export interface ItemStep {
  tick: number;
  text: string;
  place: string;
}

const where = (s: string) => s.replace(/^(location|place):/, '');
const isPlace = (s: string) => /^(location|place):/.test(s);

/** An item's life in the run (up to a tick): where it appeared, who took, gave, stole, used or
 * lost it, and the places it went through, also while someone carried it around. */
export function itemTrail(events: SimEvent[], item: string, upTo = Infinity): { steps: ItemStep[]; places: string[] } {
  const steps: ItemStep[] = [];
  const places: string[] = [];
  const holders = new Map<string, number>();
  const at = (p: string) => {
    if (p && places.at(-1) !== p) places.push(p);
  };
  const hold = (who: string, n: number) => {
    const v = (holders.get(who) ?? 0) + n;
    if (v > 1e-9) holders.set(who, v);
    else holders.delete(who);
  };
  for (const e of events) {
    if (e.tick > upTo) break;
    const d = (e.data ?? {}) as Data;
    if (e.type === 'tick_end') {
      for (const a of Object.values(end(e).agents ?? {})) if (holders.has(a.name)) at(a.location);
      continue;
    }
    if (e.type === 'item_fuse' && str(d.item) === item) {
      steps.push({ tick: e.tick, text: `💥 estalla en ${str(d.location)}${str(d.agent) ? ` (lo llevaba ${str(d.agent)})` : ''}`, place: str(d.location) });
      if (str(d.agent)) hold(str(d.agent), -1);
      at(str(d.location));
      continue;
    }
    if (e.type !== 'item_transfer' || str(d.item) !== item) continue;
    const kind = str(d.kind);
    if (kind === 'income' || kind === 'holder') continue;
    const from = str(d.from);
    const to = str(d.to);
    const amount = Number(d.amount ?? 1) || 1;
    const loc = str(d.location) || (isPlace(to) ? where(to) : isPlace(from) ? where(from) : '');
    const n = amount === 1 ? '' : ` (${amount})`;
    let text = '';
    if (kind === 'take') text = `${to} lo coge${isPlace(from) ? ` en ${where(from)}` : ''}${n}`;
    else if (kind === 'give') text = `${from} se lo da a ${to}${n}`;
    else if (kind === 'steal') text = `${to} se lo roba a ${from}${n}`;
    else if (kind === 'use') text = `${from} lo usa${to && to !== from ? ` con ${to}` : ''}`;
    else if (kind === 'drop' || kind === 'dropped') text = `${from} lo deja en ${loc}${n}`;
    else if (!from && isPlace(to)) text = `aparece en ${where(to)}${n}`;
    else if (!from && to) text = `${to} lo consigue${n}`;
    else if (from && !to) text = `${from} lo gasta o lo pierde${n}`;
    else text = `${from || '—'} → ${to || '—'}${n}`;
    if (from && !isPlace(from) && !from.startsWith('group:')) hold(from, -amount);
    if (to && !isPlace(to) && !to.startsWith('group:') && kind !== 'use') hold(to, amount);
    steps.push({ tick: e.tick, text, place: loc });
    at(loc);
  }
  return { steps, places };
}

/** Items worth following in a run: the ones that changed hands, coveted and dangerous ones first. */
export function trackableItems(events: SimEvent[], config?: { items?: Record<string, { visible?: boolean; fuse?: unknown; weapon?: unknown }> } | null): string[] {
  const moved = new Map<string, number>();
  for (const e of events)
    if (e.type === 'item_transfer' && e.data.kind !== 'income' && e.data.kind !== 'holder') moved.set(str(e.data.item), (moved.get(str(e.data.item)) ?? 0) + 1);
  const rank = (name: string) => {
    const spec = config?.items?.[name];
    return (spec?.visible ? 0 : spec?.fuse ? 1 : spec?.weapon ? 2 : 3) * 1000 - (moved.get(name) ?? 0);
  };
  return [...moved.keys()].filter(Boolean).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
