import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ScenarioConfig } from '../api/scenario';
import { optionsFromConfig, ordersSummary, priorityChoices, redLineChoices } from '../player/OrdersForm';
import { DEFAULT_WORDS, wordsOf } from './words';

describe('words and order options come from the scenario', () => {
  it('uses neutral words unless the scenario names its own', () => {
    expect(wordsOf(undefined)).toEqual(DEFAULT_WORDS);
    expect(wordsOf({ group: 'tripulación', territory: 'sector' })).toEqual({ group: 'tripulación', groups: 'tripulaciones', territory: 'sector', territories: 'sectores' });
    expect(wordsOf({ group: 'casa', groups: 'casas nobles' }).groups).toBe('casas nobles');
  });

  it('offers a scenario its own actions and prizes, nothing from another one', () => {
    const cfg = {
      environment: { locations: [{ name: 'Puente', territory: true }] },
      actions: { sabotaje: { description: 'romper la máquina' }, delatar: { description: 'contarle al capitán', target: 'agent' } },
      items: { llave: { visible: true }, pan: {} },
      factions: { Rebeldes: { members: [] } },
    } as unknown as ScenarioConfig;
    const o = optionsFromConfig(cfg);
    const w = wordsOf({ group: 'tripulación', territory: 'sector' });
    const all = [...priorityChoices(w, o), ...redLineChoices(w, o).map((r) => r[2])].join(' | ');
    expect(all).toContain('que gane mi tripulación');
    expect(all).toContain('conseguir llave');
    expect(all).toContain('defender nuestros sectores');
    expect(all).toContain('Nunca: romper la máquina');
    expect(all).toContain('contarle al capitán (a alguien de mi tripulación)');
    expect(all).not.toMatch(/banda|barrio|maletín|chivarse|palo/i);
    expect(ordersSummary({ red_lines: [{ action: 'delatar', target: 'my_group' }] }, w, o)).toBe('nunca: contarle al capitán (a alguien de mi tripulación)');
  });

  it('every bundled scenario gets options without other scenarios leaking in', () => {
    for (const name of ['kepler-station', 'zombie-siege', 'los-santos']) {
      let raw: string;
      try {
        raw = readFileSync(new URL(`../../public/fixtures/${name}.json`, import.meta.url), 'utf8');
      } catch {
        continue;
      }
      const cfg = JSON.parse(raw).config as ScenarioConfig;
      const o = optionsFromConfig(cfg);
      const text = [...priorityChoices(DEFAULT_WORDS, o), ...redLineChoices(DEFAULT_WORDS, o).map((r) => r[2])].join(' ');
      if (name !== 'los-santos') expect(text).not.toMatch(/maletín|chivarse|dar un palo/i);
    }
  });
});
