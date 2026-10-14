import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Environment, Location, SimEvent } from '../../api/types';
import { generateMap, isWalkable, routeBetween, type LayoutKind } from './model';
import { resolveRole } from './roles';

const events: SimEvent[] = JSON.parse(
  readFileSync(new URL('../../../public/fixtures/epidemic.json', import.meta.url), 'utf8'),
).events;
const epidemic: Environment = events.find((e) => e.type === 'tick_end')!.data.environment;

function loc(name: string, type: string, position: [number, number], capacity = 20): Location {
  return { name, type, position, capacity, city: '', virtual: false, occupants: [], occupant_count: 0, properties: {} };
}

const crowded: Environment = {
  width: 10,
  height: 10,
  global_state: {},
  locations: Object.fromEntries(
    [
      loc('Bridge', 'command', [5, 1], 8),
      loc('Engine Room', 'generic', [5, 9], 6),
      loc('Mess Hall', 'social', [2, 5], 40),
      loc('Medbay', 'generic', [8, 5], 10),
      loc('Cargo Bay', 'generic', [8, 9], 30),
      loc('Quarters A', 'residential', [2, 9], 12),
      loc('Quarters B', 'residential', [2, 9], 12), // same position as A
      loc('Feed', 'social', [0, 0], 99),
    ].map((l) => [l.name, l]),
  ),
};
crowded.locations.Feed.virtual = true;

describe.each<LayoutKind>(['outdoor', 'indoor', 'void'])('generateMap(%s)', (layout) => {
  for (const [label, env] of [
    ['epidemic', epidemic],
    ['crowded', crowded],
  ] as const) {
    it(`${label}: places every physical location without overlap`, () => {
      const map = generateMap(env, layout, label);
      const physical = Object.values(env.locations).filter((l) => !l.virtual);
      expect(map.zones.map((z) => z.name).sort()).toEqual(physical.map((l) => l.name).sort());
      for (const a of map.zones)
        for (const b of map.zones) {
          if (a === b) continue;
          const overlap =
            a.body.x < b.body.x + b.body.w && b.body.x < a.body.x + a.body.w && a.body.y < b.body.y + b.body.h && b.body.y < a.body.y + a.body.h;
          expect(overlap, `${a.name} overlaps ${b.name}`).toBe(false);
        }
    });

    it(`${label}: every zone is reachable from every other zone`, () => {
      const map = generateMap(env, layout, label);
      for (const z of map.zones) {
        expect(z.spots.length).toBeGreaterThan(0);
        for (const s of z.spots) expect(isWalkable(map, s.x, s.y), `${z.name} spot`).toBe(true);
      }
      const [first, ...rest] = map.zones;
      for (const z of rest) expect(routeBetween(map, first.spots[0], z.spots[0]), `${first.name} → ${z.name}`).not.toBeNull();
    });

    it(`${label}: is deterministic`, () => {
      expect(generateMap(env, layout, label)).toEqual(generateMap(env, layout, label));
    });
  }
});

describe('resolveRole', () => {
  it('prefers explicit ui_role, then type, then keywords', () => {
    expect(resolveRole({ name: 'Town Clinic', type: 'commercial', properties: { ui_role: 'medical' } })).toBe('medical');
    expect(resolveRole({ name: 'Town Clinic', type: 'healthcare', properties: {} })).toBe('medical');
    expect(resolveRole({ name: 'Cargo Bay', type: 'generic', properties: {} })).toBe('storage');
    expect(resolveRole({ name: 'Mess Hall', type: 'generic', properties: {} })).toBe('social');
    expect(resolveRole({ name: 'Puente de mando', type: 'generic', properties: {} })).toBe('command');
    expect(resolveRole({ name: 'Línea de montaje', type: 'generic', properties: {} })).toBe('production');
    expect(resolveRole({ name: 'Zone 7', type: 'generic', properties: { description: 'Reactor and engines' } })).toBe('engineering');
    expect(resolveRole({ name: 'Zone 8', type: 'generic', properties: {} })).toBe('generic');
  });
});
