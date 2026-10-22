import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SimEvent } from '../api/types';
import { initialSnapshot, reduce, type SimSnapshot } from './reduce';
import { useSim } from './simStore';
import { jumpMoment, playReplay, seekReplay, stepReplay, timelineOf, type ReplayFile } from './sources';

const file = JSON.parse(readFileSync(new URL('../../public/fixtures/zombie-siege.json', import.meta.url), 'utf8')) as ReplayFile;

/** The state after watching the whole replay up to the end of `tick`. */
function watched(tick: number): SimSnapshot {
  let s = initialSnapshot();
  for (const e of file.events) {
    s = reduce(s, e) ?? s;
    if (e.type === 'tick_end' && e.tick >= tick) break;
  }
  return s;
}

function same(tick: number) {
  const now = useSim.getState();
  const ref = watched(tick);
  expect(now.sim?.clock.tick).toBe(tick);
  expect(now.sim).toEqual(ref.sim);
  expect(now.feed.map((f) => f.text)).toEqual(ref.feed.map((f) => f.text));
  expect(now.moments).toEqual(ref.moments);
  expect(now.chapters).toEqual(ref.chapters);
}

describe('replay player', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    playReplay(file);
    useSim.getState().set({ paused: true });
  });
  afterEach(() => vi.useRealTimers());

  it('jumps forward and back to exactly what watching it would show', () => {
    seekReplay(50);
    same(50);
    seekReplay(12);
    same(12);
    stepReplay(1);
    same(13);
    seekReplay(90);
    same(90);
    expect(useSim.getState().scenarioConfig?.simulation.name).toBe('El asedio de San Lorenzo'); // kept after jumping back
    seekReplay(104);
    expect(useSim.getState().status).toBe('ended'); // the ending comes with the last tick
    expect(useSim.getState().endMessage).toMatch(/helicóptero/);
  });

  it('knows the whole run: ticks, clock and key moments, and jumps between moments', () => {
    const t = useSim.getState().replayTimeline!;
    expect(t.ticks).toBe(104);
    expect(t.times[24]).toMatch(/Day 2|Día 2/);
    expect(t.moments.some((m) => m.kind === 'agent_death')).toBe(true);
    seekReplay(0);
    const start = useSim.getState().sim!.clock.tick;
    jumpMoment(1);
    const next = Math.min(...t.moments.map((m) => m.tick).filter((x) => x > start));
    expect(useSim.getState().sim?.clock.tick).toBe(next);
    jumpMoment(-1);
    expect(useSim.getState().sim?.clock.tick).toBeLessThan(next);
  });

  it('builds a timeline from any list of events', () => {
    const events: SimEvent[] = [
      { type: 'tick_end', tick: 1, data: { clock: { time: 'Day 1, 01:00' } }, source: '' } as unknown as SimEvent,
      { type: 'agent_death', tick: 2, data: { agent: 'Ana' }, source: 'Ana' },
    ];
    expect(timelineOf(events)).toEqual({
      ticks: 2,
      times: { 1: 'Day 1, 01:00' },
      moments: [expect.objectContaining({ tick: 2, text: 'Ana muere', kind: 'agent_death' })],
    });
  });
});
