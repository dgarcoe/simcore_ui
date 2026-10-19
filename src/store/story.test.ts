import { describe, expect, it } from 'vitest';
import type { SimEvent, SimState } from '../api/types';
import { initialSnapshot, reduce, type SimSnapshot } from './reduce';
import { edgesOf, frameAt, relFrame, scoreEvent, storyHtml, toneScore } from './story';

const ev = (type: string, tick: number, data: Record<string, unknown>, source = ''): SimEvent =>
  ({ type, tick, data, source, timestamp: 0 }) as unknown as SimEvent;

const state = (agents: Record<string, Partial<SimState['agents'][string]>>): SimState =>
  ({ clock: { tick: 1 }, agents, environment: { locations: {} } }) as unknown as SimState;

describe('story moments', () => {
  it('scores events like Simcore does', () => {
    expect(scoreEvent(ev('agent_death', 3, { agent: 'Ana', cause: 'hambre' }))).toMatchObject({ importance: 1, text: 'Ana muere (hambre)', agents: ['Ana'] });
    expect(scoreEvent(ev('condition_change', 4, { agent: 'Ana', condition: 'infectado', change: 'transformed', into: 'zombi' }))?.importance).toBe(0.9);
    expect(scoreEvent(ev('belief_shared', 5, { from: 'Ana', to: 'Bob', text: 'x', secret: true }))?.text).toContain('secreto');
    expect(scoreEvent(ev('agent_move', 5, { action: 'moves to Plaza' }))).toBeNull();
    expect(scoreEvent(ev('rule_fired', 6, { description: 'Cae el pueblo', effects: { end: 'fin' } }))?.importance).toBe(0.9);
  });

  it('collects moments, chapters and relationship frames in the store', () => {
    let s: SimSnapshot = initialSnapshot();
    const apply = (e: SimEvent) => (s = reduce(s, e) ?? s);
    apply(ev('simulation_start', 0, { config: 'X' }));
    apply(ev('agent_death', 1, { agent: 'Ana', cause: 'frío' }, 'Ana'));
    apply(ev('story_chapter', 1, { n: 1, title: 'La primera noche', text: 'Ana murió.', from_tick: 1, to_tick: 4 }));
    apply(ev('tick_end', 1, state({ a: { name: 'Ana', location: 'Plaza', status: 'dead', relationships: { Bob: 'Bob (hostile, 2 interactions)' } }, b: { name: 'Bob', location: 'Plaza', relationship_scores: { Ana: -0.5 } } }) as unknown as Record<string, unknown>));
    expect(s.moments.map((m) => m.text)).toEqual(['Ana muere (frío)']);
    expect(s.chapters[0].title).toBe('La primera noche');
    expect(s.feed.at(-1)?.text).toBe('📖 La primera noche');
    expect(s.relFrames[0].rels).toEqual({ Ana: { Bob: -0.7 }, Bob: { Ana: -0.5 } });
  });
});

describe('relationship graph', () => {
  it('maps descriptions to sentiment and averages both directions', () => {
    expect(toneScore('Bob: your brother (close friend, 3 interactions)')).toBe(0.7);
    const f = relFrame(1, state({ a: { name: 'Ana', relationship_scores: { Bob: 0.8, Cid: 0.05 }, relationship_kinds: { Bob: 'hermano' } }, b: { name: 'Bob', relationship_scores: { Ana: 0.4 } }, c: { name: 'Cid' } }));
    expect(edgesOf(f)).toEqual([{ a: 'Ana', b: 'Bob', value: 0.6000000000000001, kind: 'hermano' }]);
  });

  it('finds the frame for a tick', () => {
    const frames = [1, 3, 6].map((t) => ({ tick: t, rels: {}, kinds: {}, status: {}, places: {} }));
    expect(frameAt(frames, 4)?.tick).toBe(3);
    expect(frameAt(frames, 0)?.tick).toBe(1);
  });
});

describe('downloadable story', () => {
  it('includes chapters, key moments, the cast and escapes HTML', () => {
    const html = storyHtml({
      title: 'Asedio <1>',
      chapters: [{ n: 1, title: 'Noche', text: 'Llegan.', from_tick: 1, to_tick: 24 }],
      moments: [{ tick: 3, importance: 1, text: 'Ana muere', kind: 'agent_death', agents: ['Ana'], place: '' }],
      cast: [{ name: 'Ana', status: 'dead' }],
      ending: 'Fin',
    });
    expect(html).toContain('<title>Asedio &lt;1&gt;</title>');
    expect(html).toContain('<h2>Noche</h2><p>Llegan.</p>');
    expect(html).toContain('<span class="tick">t3</span> Ana muere');
    expect(html).toContain('<li>Ana ✝</li>');
  });
});
