import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../api/types';
import { AWARDS, awardTitle, highlightText, shareText } from './awards';
import { initialSnapshot, reduce } from './reduce';

describe('awards', () => {
  it('words every award Simcore gives', () => {
    for (const key of ['knockouts', 'brawler', 'punching_bag', 'thief', 'talker', 'wanderer', 'lucky', 'unlucky', 'turncoat', 'tempted', 'schemer', 'pacifist', 'untouchable'])
      expect(AWARDS[key], key).toBeDefined();
    expect(awardTitle({ key: 'knockouts', agent: 'Toro', value: 1 })).toEqual({ title: 'El Martillo', icon: '🔨', detail: '1 rival tumbado' });
    expect(awardTitle({ key: 'new_one', agent: 'X', value: 2 }).title).toBe('new_one');
  });

  it('tells highlights and a text to share', () => {
    expect(highlightText({ tick: 3, kind: 'knocked_out', importance: 0.7, target: 'Grasa', weapon: 'bate' })).toBe('Deja K.O. a Grasa con bate');
    expect(highlightText({ tick: 3, kind: 'stole', importance: 0.5, item: 'dinero', target: 'Tito' })).toBe('Le roba dinero a Tito');
    expect(highlightText({ tick: 3, kind: 'group', importance: 0.6, change: 'left', group: 'La Familia' })).toBe('Deja La Familia');
    const text = shareText({
      game: 'Guerra',
      agent: 'Rata',
      rank: 2,
      players: 16,
      points: 40,
      winner: 'Los del Puerto',
      awards: [{ key: 'thief', agent: 'Rata', value: 4 }, { key: 'brawler', agent: 'Toro', value: 9 }],
      highlights: [{ tick: 5, kind: 'stole', importance: 0.5, item: 'dinero', target: 'Tito' }],
    });
    expect(text).toContain('Puesto 2 de 16 · 40 puntos');
    expect(text).toContain('🧤 Manos Largas');
    expect(text).not.toContain('Puños');
    expect(text).toContain('t5 Le roba dinero a Tito');
  });

  it('keeps them from the end of the run', () => {
    const e: SimEvent = {
      type: 'simulation_end',
      tick: 9,
      source: '',
      data: { reason: 'completed', message: '', awards: [{ key: 'thief', agent: 'Rata', value: 2 }], highlights: { Rata: [{ tick: 3, kind: 'stole', importance: 0.5 }] } },
    };
    const s = reduce(initialSnapshot(), e)!;
    expect(s.endAwards).toEqual([{ key: 'thief', agent: 'Rata', value: 2 }]);
    expect(s.endHighlights.Rata).toHaveLength(1);
  });
});
