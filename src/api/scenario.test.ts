import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanScenario, configToEnvironment, emptyScenario, mapHints, professions, effectsToForm, formToEffects, setModel, targetLabel, uniqueName, validateScenario, type ScenarioConfig } from './scenario';

const ship: ScenarioConfig = JSON.parse(
  readFileSync(new URL('../../public/fixtures/spaceship.json', import.meta.url), 'utf8'),
).config;

describe('configToEnvironment', () => {
  it('matches what Simcore reports for the same scenario', () => {
    const env = configToEnvironment(ship);
    expect(Object.keys(env.locations)).toContain('Bridge');
    expect(env.locations['Ship Comms'].virtual).toBe(true);
    expect(env.locations.Bridge.occupants).toEqual(['captain_ortega', 'lin']);
    expect(env.global_state.ui_theme).toBe('spaceship');
    expect([env.width, env.height]).toEqual([12, 12]);
  });
});

describe('mapHints / professions', () => {
  it('collects residents and resources per starting location', () => {
    const hints = mapHints(ship);
    expect(hints.residents.Bridge).toEqual(['Captain Ortega', 'Lin']);
    expect(hints.resources.Medbay).toEqual(['medkits']);
    expect(hints.resources['Engine Room']).toEqual(['parts']);
    expect(professions(ship)['Juno']).toBe('engineer');
  });
  it('handles a missing config', () => {
    expect(mapHints(null)).toEqual({ residents: {}, resources: {} });
  });
});

describe('validateScenario', () => {
  it('accepts the default and recorded scenarios', () => {
    expect(validateScenario(emptyScenario()).filter((i) => i.path !== 'simulation.name')).toEqual([]);
    expect(validateScenario(ship)).toEqual([]);
  });
  it('reports common mistakes', () => {
    const cfg = emptyScenario();
    cfg.environment.locations.push({ ...cfg.environment.locations[0] });
    cfg.environment.locations[1].position = [99, 0];
    cfg.agents[0].starting_location = 'Nowhere';
    cfg.agents.push({ name: '' });
    const messages = validateScenario(cfg).map((i) => i.message).join('\n');
    expect(messages).toMatch(/nombre/);
    expect(messages).toMatch(/dos lugares llamados «Plaza»/);
    expect(messages).toMatch(/fuera de la cuadrícula/);
    expect(messages).toMatch(/«Nowhere», que no existe/);
    expect(messages).toMatch(/agente #2 no tiene nombre/);
  });
});

describe('cleanScenario', () => {
  it('drops empty goals and events', () => {
    const cfg = emptyScenario();
    cfg.agents[0].goals = ['  save the town ', '', ' '];
    cfg.events = { scheduled: [{ tick: 1, type: 'crisis', description: '' }] };
    const clean = cleanScenario(cfg);
    expect(clean.agents[0].goals).toEqual(['save the town']);
    expect(clean.events?.scheduled).toEqual([]);
  });
});

describe('setModel', () => {
  it('moves the reflection model along when it matched the main one', () => {
    const cfg = emptyScenario();
    cfg.llm = { model: 'ollama/qwen2.5:7b', reflection_model: 'ollama/qwen2.5:7b' };
    setModel(cfg, 'ollama/qwen2.5:3b');
    expect(cfg.llm).toMatchObject({ model: 'ollama/qwen2.5:3b', reflection_model: 'ollama/qwen2.5:3b' });
  });
  it('fills an empty reflection model and keeps a custom one', () => {
    const a = emptyScenario();
    a.llm = { model: 'x' };
    setModel(a, 'y');
    expect(a.llm?.reflection_model).toBe('y');
    const b = emptyScenario();
    b.llm = { model: 'x', reflection_model: 'big' };
    setModel(b, 'y');
    expect(b.llm?.reflection_model).toBe('big');
  });
});

describe('uniqueName', () => {
  it('numbers copies instead of stacking suffixes', () => {
    expect(uniqueName('Habitante', ['Habitante'])).toBe('Habitante 2');
    expect(uniqueName('Habitante 2', ['Habitante', 'Habitante 2'])).toBe('Habitante 3');
    expect(uniqueName('Habitante 2 2 2', ['Habitante', 'Habitante 2', 'Habitante 3'])).toBe('Habitante 4');
    expect(uniqueName('Dr. Amara', ['Dr. Amara'])).toBe('Dr. Amara 2');
  });
});

describe('event effects form', () => {
  it('round-trips agent effects and keeps world keys', () => {
    const fx = {
      school_closed: true,
      kill: 'Ana',
      depart: ['Bruno'],
      health: { 'location:Plaza': -0.3 },
      spawn: { name: 'Medic', count: 2 },
    };
    const form = effectsToForm(fx);
    expect(form.kill).toEqual(['Ana']);
    expect(form.health).toEqual([{ target: 'location:Plaza', delta: -0.3 }]);
    expect(form.world).toEqual({ school_closed: true });
    expect(formToEffects(form)).toEqual({ ...fx, kill: ['Ana'], spawn: [{ name: 'Medic', count: 2 }] });
  });

  it('drops empty parts', () => {
    const form = effectsToForm(undefined);
    form.health.push({ target: '', delta: -0.2 });
    form.spawn.push({ name: '  ' });
    expect(formToEffects(form)).toBeUndefined();
  });

  it('labels targets', () => {
    expect(targetLabel('all')).toBe('Todos');
    expect(targetLabel('location:Clínica')).toBe('Todos en Clínica');
    expect(targetLabel('Rosa')).toBe('Rosa');
  });
});
