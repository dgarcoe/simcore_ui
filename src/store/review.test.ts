import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../api/types';
import { agentTrail, dayRecap, daysOf, fightHeat, filterMoments, parseReplayHash, pathOf, replayHash, seriesOf, summarizeRun } from './review';
import { timelineOf } from './sources';

const file = JSON.parse(readFileSync(new URL('../../public/fixtures/los-santos.json', import.meta.url), 'utf8'));
const events: SimEvent[] = file.events;
const timeline = timelineOf(events);

describe('reviewing Los Santos', () => {
  it('follows territories and points per group over time', () => {
    const s = seriesOf(events);
    expect(s.ticks.length).toBe(36);
    const groups = Object.keys(s.groups);
    expect(groups).toContain('Los Motoristas');
    expect(s.groups['Los Motoristas'].color).toMatch(/^#/);
    // at every tick no more territories are held than exist
    s.ticks.forEach((_, i) => expect(groups.reduce((n, g) => n + s.groups[g].territories[i], 0)).toBeLessThanOrEqual(8));
    expect(Object.keys(s.agents)).toHaveLength(5);
  });

  it('splits the run into days and sums each one up', () => {
    expect(timeline.days.map((d) => d.day)).toEqual([1, 2, 3]);
    expect(daysOf({ 1: 'Day 1, 02:00', 12: 'Day 2, 00:00', 13: 'Day 2, 02:00' })).toEqual([
      { day: 1, start: 1, end: 12 },
      { day: 2, start: 13, end: 13 },
    ]);
    const r = dayRecap(events, timeline.moments, timeline.days[0]);
    expect(r.groups.length).toBe(4);
    expect(r.people[0].gained).toBeGreaterThanOrEqual(r.people.at(-1)!.gained);
    expect(r.moments.every((m) => m.tick >= r.from && m.tick <= r.to)).toBe(true);
    expect(r.counts.captures).toBeGreaterThan(0);
  });

  it('marks captures and knockouts and filters them', () => {
    expect(timeline.moments.some((m) => m.kind === 'territory_change')).toBe(true);
    const noTurf = filterMoments(timeline.moments, { hidden: ['turf'] });
    expect(noTurf.some((m) => m.kind === 'territory_change')).toBe(false);
    const toro = filterMoments(timeline.moments, { hidden: [], agent: 'Toro' });
    expect(toro.length).toBeGreaterThan(0);
    expect(toro.every((m) => m.agents.includes('Toro'))).toBe(true);
  });

  it("tells an agent's run tick by tick, with reasons and points", () => {
    const rows = agentTrail(events, 'Toro', timeline.times);
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.every((r, i) => i === 0 || r.tick > rows[i - 1].tick)).toBe(true);
    expect(rows.some((r) => r.items.some((i) => i.why))).toBe(true);
    expect(rows.some((r) => r.points !== undefined && r.place)).toBe(true);
    expect(rows.some((r) => r.items.some((i) => i.icon === '📜'))).toBe(true); // Toro's plan fired
  });

  it('draws paths and fights up to the current tick', () => {
    const path = pathOf(events, 'Toro', 36);
    expect(path.length).toBeGreaterThan(1);
    expect(path.every((p, i) => i === 0 || p !== path[i - 1])).toBe(true);
    expect(pathOf(events, 'Toro', 0)).toEqual([]);
    const heat = fightHeat(events, 36);
    expect(Object.values(heat).reduce((a, b) => a + b, 0)).toBeGreaterThan(fightHeat(events, 10)['El Puerto'] ?? 0);
  });

  it('sums a run up to compare it with another', () => {
    const s = summarizeRun('Los Santos', events, file.config);
    expect(s.winner).toBe(file.events.at(-1).data.winner);
    expect(s.winner).toBeTruthy();
    expect(s.ticks).toBe(36);
    expect(s.useful).toBeLessThanOrEqual(s.decisions);
    expect(Object.keys(s.styles).length).toBeGreaterThan(2);
    expect(s.captures).toBeGreaterThan(0);
  });
});

describe('links to a moment', () => {
  it('round-trips', () => {
    const link = { file: 'fixtures/los-santos.json', tick: 13, agent: 'Íñigo' };
    expect(parseReplayHash(replayHash(link))).toEqual({ ...link, run: undefined });
    expect(parseReplayHash('#run=20260101_x&t=0')).toEqual({ file: undefined, run: '20260101_x', tick: 0, agent: undefined });
    expect(parseReplayHash('#/jugar/ABC')).toBeNull();
  });
});

describe('nothing tied to one scenario', () => {
  it('finds hostile actions from what they do, not their names', async () => {
    const { hostileActions } = await import('./review');
    const h = hostileActions(file.config);
    expect(h.has('dar_un_palo')).toBe(true); // steals from its target
    expect(h.has('pintada')).toBe(false);
    expect(hostileActions({ actions: { sabotear: { target: 'agent', on_target: { health: -0.2 } }, saludar: { target: 'agent' } } })).toEqual(new Set(['sabotear']));
  });
});

describe('following an item', () => {
  it('tells whose hands and which places the briefcase went through', async () => {
    const { itemTrail, trackableItems } = await import('./review');
    const items = trackableItems(events, file.config);
    expect(items[0]).toBe('maletin'); // coveted items first
    const { steps, places } = itemTrail(events, 'maletin');
    expect(steps[0].text).toBe('aparece en Las Afueras');
    expect(places[0]).toBe('Las Afueras');
    // an item that changed hands: steps in order, through several places
    const busy = items.map((i) => itemTrail(events, i)).find((t) => t.steps.length > 3)!;
    expect(busy.steps.every((s, i) => i === 0 || s.tick >= busy.steps[i - 1].tick)).toBe(true);
    expect(busy.steps.some((s) => / lo coge| se lo da a | se lo roba a /.test(s.text))).toBe(true);
    expect(itemTrail(events, 'maletin', 0).steps).toEqual([]);
  });
});

describe('money', () => {
  it('follows how much each group and the richest have', () => {
    const s = seriesOf(events, 'dinero');
    expect(Object.keys(s.groupWealth)).toContain('Los Motoristas');
    expect(s.groupWealth['Los Motoristas']).toHaveLength(s.ticks.length);
    expect(Object.keys(s.richest).length).toBeGreaterThan(0);
    const trades = events.filter((e) => e.type === 'market_trade');
    expect(trades.length).toBeGreaterThan(0);
  });
});
