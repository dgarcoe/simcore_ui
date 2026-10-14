import { describe, expect, it } from 'vitest';
import type { Environment, Location } from '../api/types';
import { resolveTheme } from './registry';

function env(names: Array<[string, string, string?]>, global_state: Record<string, unknown> = {}): Environment {
  const locations: Record<string, Location> = {};
  for (const [name, type, description] of names)
    locations[name] = {
      name, type, position: [0, 0], capacity: 10, city: '', virtual: false, occupants: [], occupant_count: 0,
      properties: description ? { description } : {},
    };
  return { width: 10, height: 10, locations, global_state };
}

describe('resolveTheme', () => {
  const ship = env([
    ['Bridge', 'command', 'Command deck of the starship'],
    ['Medbay', 'healthcare'],
    ['Engine Room', 'industrial', 'Reactor and warp core'],
    ['Crew Quarters', 'residential'],
  ]);

  it('manual choice wins', () => {
    expect(resolveTheme({ manual: 'factory', env: ship })).toMatchObject({ source: 'manual', theme: { id: 'factory' } });
  });

  it('uses ui_theme from the scenario YAML', () => {
    const e = env([['Shop', 'commercial']], { ui_theme: 'warehouse' });
    expect(resolveTheme({ env: e })).toMatchObject({ source: 'scenario', theme: { id: 'warehouse' } });
  });

  it('uses overrides by scenario name', () => {
    expect(resolveTheme({ scenarioName: 'Outbreak', env: ship })).toMatchObject({ source: 'override', theme: { id: 'town' } });
  });

  it('guesses a spaceship from location names', () => {
    expect(resolveTheme({ scenarioName: 'Deep Space Crisis', env: ship }).theme.id).toBe('spaceship');
  });

  it('guesses a space battle', () => {
    const e = env([
      ['Flagship Bridge', 'command'],
      ['Frigate Valiant', 'military'],
      ['Enemy Cruiser', 'military'],
      ['Asteroid Field', 'generic'],
    ]);
    expect(resolveTheme({ scenarioName: 'Battle of Orion', scenarioDescription: 'Two fleets clash in orbit', env: e }).theme.id).toBe(
      'space-battle',
    );
  });

  it('guesses a warehouse and a factory', () => {
    const w = env([
      ['Loading Dock', 'transport'],
      ['Aisle 4', 'storage', 'Pallet racks and forklifts'],
      ['Shipping Office', 'administrative'],
    ]);
    expect(resolveTheme({ scenarioName: 'Peak Season', env: w }).theme.id).toBe('warehouse');
    const f = env([
      ['Assembly Line', 'industrial'],
      ['Foundry', 'industrial'],
      ['Break Room', 'social', 'Where workers rest between shifts'],
    ]);
    expect(resolveTheme({ scenarioName: 'The Strike', scenarioDescription: 'Factory workers consider a strike', env: f }).theme.id).toBe(
      'factory',
    );
  });

  it('falls back to town', () => {
    expect(resolveTheme({ env: env([['A', 'generic']]) })).toMatchObject({ source: 'default', theme: { id: 'town' } });
  });
});
