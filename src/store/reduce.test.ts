import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../api/types';
import { initialSnapshot, reduce, type SimSnapshot } from './reduce';

const fixture: SimEvent[] = JSON.parse(
  readFileSync(new URL('../../public/fixtures/epidemic.json', import.meta.url), 'utf8'),
).events;

function run(events: SimEvent[], start = initialSnapshot()): SimSnapshot {
  return events.reduce((s, e) => reduce(s, e) ?? s, start);
}

const ev = (type: SimEvent['type'], tick: number, data: Record<string, unknown>, source = ''): SimEvent => ({
  type,
  tick,
  data,
  source,
});

describe('reduce', () => {
  it('replays a recorded run end to end', () => {
    const s = run(fixture);
    expect(s.scenarioName).toBe('Outbreak');
    expect(s.sim?.clock.tick).toBeGreaterThan(0);
    expect(Object.keys(s.sim!.agents)).toHaveLength(6);
    expect(s.conversations.length).toBeGreaterThan(0);
    expect(s.feed.length).toBeGreaterThan(0);
  });

  it('ignores duplicated events', () => {
    const e = ev('agent_move', 3, { action: 'moves to School' }, 'Rosa');
    const s1 = reduce(initialSnapshot(), e)!;
    expect(reduce(s1, e)).toBeNull();
  });

  it('groups speech between the same pair into one conversation', () => {
    const s = run([
      ev('agent_speak', 1, { action: 'says to Bob: "hi"' }, 'Ann'),
      ev('agent_speak', 2, { action: 'says to Ann: "hello"' }, 'Bob'),
      ev('interaction', 3, { result: 'Ann trades with Bob: two apples' }, 'Ann'),
      ev('agent_speak', 3, { action: 'says to Cid: "yo"' }, 'Ann'),
    ]);
    expect(s.conversations).toHaveLength(2);
    const annBob = s.conversations.find((c) => c.participants.includes('Bob'))!;
    expect(annBob.lines.map((l) => l.kind)).toEqual(['speak', 'speak', 'trade']);
    expect(annBob.lines[1]).toMatchObject({ speaker: 'Bob', target: 'Ann', text: 'hello' });
  });

  it('starts a new conversation after a long silence', () => {
    const s = run([
      ev('agent_speak', 1, { action: 'says to Bob: "hi"' }, 'Ann'),
      ev('agent_speak', 10, { action: 'says to Bob: "again"' }, 'Ann'),
    ]);
    expect(s.conversations).toHaveLength(2);
  });

  it('shows a banner for scheduled and injected events', () => {
    const s = run([ev('injected_event', 4, { description: 'Fire!', location: 'Market' })]);
    expect(s.banner).toMatchObject({ kind: 'injected', text: 'Fire!', location: 'Market' });
  });

  it('records posts and reflections', () => {
    const s = run([
      ev('agent_post', 1, { action: 'posts online: big news' }, 'Ann'),
      ev('reflection', 12, { summary: 'I learned things' }, 'Ann'),
    ]);
    expect(s.posts).toEqual([{ tick: 1, author: 'Ann', text: 'big news' }]);
    expect(s.reflections.Ann).toEqual([{ tick: 12, text: 'I learned things' }]);
  });

  it('resets on simulation_start', () => {
    const s = run([
      ev('agent_speak', 1, { action: 'says to Bob: "hi"' }, 'Ann'),
      ev('simulation_start', 0, { config: 'Again', agents: 2 }),
    ]);
    expect(s.conversations).toHaveLength(0);
    expect(s.scenarioName).toBe('Again');
    expect(s.status).toBe('running');
  });
});
