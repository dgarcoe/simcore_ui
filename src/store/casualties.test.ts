import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../api/types';
import { emptyCasualties, groupCasualties, rivalries, tallyCasualties } from './casualties';
import { initialSnapshot, reduce } from './reduce';

const ev = (type: string, data: Record<string, unknown>, source = '', tick = 1): SimEvent => ({ type, data, source, tick }) as SimEvent;

describe('casualties', () => {
  it('counts who downed whom, how, collapses and turns in hospital', () => {
    let c = emptyCasualties();
    c = tallyCasualties(c, ev('agent_knockout', { agent: 'Ancla', by: 'Toro', how: 'attack', weapon: 'bate' }, 'Ancla'));
    c = tallyCasualties(c, ev('agent_knockout', { agent: 'Ancla', by: 'Toro', how: 'attack' }, 'Ancla'));
    c = tallyCasualties(c, ev('agent_knockout', { agent: 'Toro', how: 'fuse' }, 'Toro'));
    c = tallyCasualties(c, ev('agent_knockout', { agent: 'Rata', cause: 'Nena with the bate' }, 'Rata')); // older recordings
    c = tallyCasualties(c, ev('agent_action', { action_type: 'rest', exhausted: true }, 'Pipo'));
    c = tallyCasualties(c, ev('agent_action', { action_type: 'rest', recovering: true, left: 2 }, 'Ancla'));
    expect(c.people.Toro).toEqual({ downed: 2, fell: 1, deaths: 0, exhausted: 0, hospital: 0 });
    expect(c.people.Ancla).toMatchObject({ fell: 2, hospital: 1 });
    expect(c.people.Nena.downed).toBe(1);
    expect(c.people.Pipo.exhausted).toBe(1);
    expect(c.causes).toEqual({ bate: 2, puñetazos: 1, explosión: 1, agotamiento: 1 });
    expect(rivalries(c)[0]).toEqual({ by: 'Toro', victim: 'Ancla', times: 2 });
    const g = groupCasualties(c, { Motoristas: { members: ['Toro'] }, Puerto: { members: ['Ancla', 'Rata'] } });
    expect(g[0]).toMatchObject({ group: 'Motoristas', downed: 2, suffered: 1 });
    expect(g[1]).toMatchObject({ group: 'Puerto', suffered: 3, hospital: 1 });
  });

  it('builds up while a replay plays', () => {
    const events: SimEvent[] = JSON.parse(readFileSync(new URL('../../public/fixtures/los-santos.json', import.meta.url), 'utf8')).events;
    let s = initialSnapshot();
    for (const e of events) s = reduce(s, e) ?? s;
    const fell = Object.values(s.casualties.people).reduce((n, p) => n + p.fell, 0);
    expect(fell).toBe(events.filter((e) => e.type === 'agent_knockout').length);
    expect(Object.values(s.casualties.people).some((p) => p.hospital > 0)).toBe(true);
  });
});
