import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanScenario, configToEnvironment, emptyScenario, mapHints, professions, effectsToForm, formToEffects, itemsUsed, referenceIssues, scenarioWarnings, setModel, targetLabel, uniqueName, validateScenario, type ScenarioConfig } from './scenario';

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

  it('drops empty parts but keeps arrivals being typed', () => {
    const form = effectsToForm(undefined);
    form.health.push({ target: '', delta: -0.2 });
    expect(formToEffects(form)).toBeUndefined();
    form.spawn.push({ name: '' });
    expect(formToEffects(form)).toEqual({ spawn: [{ name: '' }] });
  });

  it('validates effect targets and arrival names', () => {
    const cfg: ScenarioConfig = structuredClone(ship);
    cfg.events = { scheduled: [{ tick: 1, type: 'x', description: 'd', effects: { kill: ['Nobody', 'all'], health: { 'location:Nowhere': -0.1 }, spawn: [{ name: '' }] } }] };
    const msgs = validateScenario(cfg).map((i) => i.message);
    expect(msgs).toContain('El suceso #1 afecta a «Nobody», que no existe.');
    expect(msgs).toContain('El suceso #1 afecta a «Todos en Nowhere», que no existe.');
    expect(msgs).toContain('Una llegada del suceso #1 no tiene nombre.');
    expect(msgs.filter((m) => m.includes('Todos»'))).toHaveLength(0);
  });

  it('labels targets', () => {
    expect(targetLabel('all')).toBe('Todos');
    expect(targetLabel('location:Clínica')).toBe('Todos en Clínica');
    expect(targetLabel('Rosa')).toBe('Rosa');
  });
});

describe('example scenarios', () => {
  it('La noche más larga validates cleanly', async () => {
    const { parse } = await import('yaml');
    const cfg = parse(readFileSync(new URL('../../scenarios/last-night/config.yaml', import.meta.url), 'utf8')) as ScenarioConfig;
    expect(validateScenario(cfg)).toEqual([]);
  });
});

describe('items in scenarios', () => {
  const base = (): ScenarioConfig => ({
    simulation: { name: 'S' },
    environment: { locations: [{ name: 'Clinic', stock: { medicine: 3 }, produces: { bandage: 1 } }] },
    agents: [{ name: 'Ana', starting_location: 'Clinic', resources: { money: 5 } }],
    events: { scheduled: [{ tick: 2, type: 'x', description: 'd', effects: { items: { 'location:Clinic': { food: 4 }, Ana: { money: -2 } } } }] },
  });

  it('round-trips item effects', () => {
    const form = effectsToForm(base().events!.scheduled![0].effects);
    expect(form.items).toEqual([
      { target: 'location:Clinic', item: 'food', delta: 4 },
      { target: 'Ana', item: 'money', delta: -2 },
    ]);
    form.items.push({ target: 'Ana', item: ' ', delta: 3 });
    expect(formToEffects(form)).toEqual({ items: { 'location:Clinic': { food: 4 }, Ana: { money: -2 } } });
  });

  it('lists the items a scenario uses and warns about missing catalog entries', () => {
    const cfg = base();
    expect(itemsUsed(cfg)).toEqual(['bandage', 'food', 'medicine', 'money']);
    expect(scenarioWarnings(cfg)).toEqual([]); // no catalog at all: nothing to warn about
    cfg.items = { medicine: { on_use: { health: 0.4 } }, food: {} };
    expect(scenarioWarnings(cfg)[0]).toContain('bandage, money');
    expect(validateScenario(cfg)).toEqual([]);
  });

  it('flags item effects on unknown targets', () => {
    const cfg = base();
    cfg.events!.scheduled![0].effects = { items: { Nadie: { food: 1 } } };
    expect(validateScenario(cfg).map((i) => i.message)).toContain('El suceso #1 afecta a «Nadie», que no existe.');
  });
});

describe('conditions and scenario actions', () => {
  it('round-trips condition effects', () => {
    const fx = { add_condition: { Ana: 'infected', 'location:Plaza': ['panicked', 'infected'] }, remove_condition: { all: ['zombie'] } };
    const form = effectsToForm(fx);
    expect(form.addCondition).toEqual([
      { target: 'Ana', condition: 'infected' },
      { target: 'location:Plaza', condition: 'panicked' },
      { target: 'location:Plaza', condition: 'infected' },
    ]);
    expect(formToEffects(form)).toEqual({
      add_condition: { Ana: ['infected'], 'location:Plaza': ['panicked', 'infected'] },
      remove_condition: { all: ['zombie'] },
    });
  });

  it('reports references to conditions and actions that do not exist', () => {
    const cfg: ScenarioConfig = {
      simulation: { name: 'Z' },
      environment: { locations: [{ name: 'Plaza' }] },
      agents: [{ name: 'Ana', starting_location: 'Plaza', conditions: ['ghost'] }],
      conditions: { zombie: { controller: 'rules', rules: { action: 'scratch' }, becomes: 'dust' } },
      actions: { move: {}, bite: { who: { conditions: ['zombie'] }, on_target: { add_conditions: ['infected'] } } },
      items: { antidote: { cures: ['infected'] } },
    };
    const msgs = referenceIssues(cfg).map((i) => i.message);
    expect(msgs).toEqual([
      'Ana usa el estado «ghost», que no existe.',
      'El objeto antidote usa el estado «infected», que no existe.',
      'La acción «move» choca con una acción básica de Simcore.',
      'La acción bite usa el estado «infected», que no existe.',
      'El estado zombie usa el estado «dust», que no existe.',
      'El estado zombie usa la acción «scratch», que no existe.',
    ]);
  });

  it('the zombie example validates cleanly', async () => {
    const { parse } = await import('yaml');
    const cfg = parse(readFileSync(new URL('../../scenarios/zombie-outbreak/config.yaml', import.meta.url), 'utf8')) as ScenarioConfig;
    expect(validateScenario(cfg)).toEqual([]);
    expect(scenarioWarnings(cfg)).toEqual([]);
  });
});

describe('world: needs, rules and places', () => {
  it('round-trips needs, place changes, adjust and end', () => {
    const fx = {
      needs: { all: { hunger: -1 } },
      locations: { Iglesia: { closed: true }, Monte: { hazard: { label: 'en llamas', per_tick: { health: -0.2 } } }, Plaza: { hazard: null } },
      adjust: { oxygen: -0.1 },
      end: 'Fin',
      luz: false,
    };
    const form = effectsToForm(fx);
    expect(form.places).toEqual([
      { place: 'Iglesia', closed: true },
      { place: 'Monte', hazard: { label: 'en llamas', per_tick: { health: -0.2 } } },
      { place: 'Plaza', hazard: null },
    ]);
    expect(form.world).toEqual({ luz: false });
    expect(formToEffects(form)).toEqual(fx);
  });

  it('reports unknown needs and places in rules, events, agents and needs', () => {
    const cfg: ScenarioConfig = {
      simulation: { name: 'W' },
      environment: { locations: [{ name: 'Plaza', hazard: { condition: 'ghost' } }] },
      agents: [{ name: 'Ana', starting_location: 'Plaza', needs: { thirst: 0.5 } }],
      needs: { hunger: { satisfied_by: { places: ['Mars'], actions: ['dance'] } } },
      rules: [
        { when: { count: { location: 'Moon', gte: 1 }, place: { Venus: { closed: true } } }, then: { locations: { Pluto: { closed: true } } } },
        { when: { every: 2 }, then: {} },
      ],
    };
    const msgs = referenceIssues(cfg).map((i) => i.message);
    expect(msgs).toEqual(
      expect.arrayContaining([
        'La regla #1 cambia el lugar «Pluto», que no existe.',
        'La regla #1 cuenta en «Moon», que no existe.',
        'La regla #1 mira el lugar «Venus», que no existe.',
        'La regla #2 no hace nada (añade consecuencias o un final).',
        'Ana tiene la necesidad «thirst», que no existe.',
        'El lugar Plaza usa el estado «ghost», que no existe.',
        'La necesidad hunger usa el lugar «Mars», que no existe.',
        'La necesidad hunger usa la acción «dance», que no existe.',
      ]),
    );
  });
});

describe('minds', () => {
  it('round-trips rumors with and without truth', () => {
    const fx = { rumor: { Ana: 'El pozo está envenenado', 'location:Taberna': { text: 'El forastero miente', true: false } } };
    const form = effectsToForm(fx);
    expect(form.rumor).toEqual([
      { target: 'Ana', text: 'El pozo está envenenado', truth: null },
      { target: 'location:Taberna', text: 'El forastero miente', truth: false },
    ]);
    expect(formToEffects(form)).toEqual(fx);
  });

  it('flags relationships with agents that do not exist', () => {
    const cfg: ScenarioConfig = {
      simulation: { name: 'M' },
      environment: { locations: [{ name: 'Plaza' }] },
      agents: [{ name: 'Ana', starting_location: 'Plaza', relationships: { Tomás: { type: 'hermano' } } }],
    };
    expect(validateScenario(cfg).map((i) => i.message)).toContain('Ana tiene relación con «Tomás», que no existe.');
  });

  it('La noche más larga still validates cleanly', async () => {
    const { parse } = await import('yaml');
    const cfg = parse(readFileSync(new URL('../../scenarios/last-night/config.yaml', import.meta.url), 'utf8')) as ScenarioConfig;
    expect(validateScenario(cfg)).toEqual([]);
  });
});

describe('advanced example', () => {
  it('Estación Kepler-7 validates cleanly and uses every feature', async () => {
    const { parse } = await import('yaml');
    const cfg = parse(readFileSync(new URL('../../scenarios/kepler-station/config.yaml', import.meta.url), 'utf8')) as ScenarioConfig;
    expect(validateScenario(cfg)).toEqual([]);
    expect(scenarioWarnings(cfg)).toEqual([]);
    expect(Object.keys(cfg.needs ?? {}).length).toBeGreaterThan(0);
    expect(cfg.rules?.some((r) => (r.then as { end?: string })?.end)).toBe(true);
    expect(cfg.simulation.planning).toBe(true);
    expect(cfg.agents.some((a) => a.arrives_at) && cfg.agents.some((a) => a.secrets?.length) && cfg.agents.some((a) => a.relationships)).toBe(true);
  });

  it('zombies keep thinking with the LLM as a changed mind; hordes stay rule-driven', async () => {
    const { parse } = await import('yaml');
    const load = (f: string) => parse(readFileSync(new URL(`../../scenarios/${f}/config.yaml`, import.meta.url), 'utf8')) as ScenarioConfig;
    const siege = load('zombie-siege');
    expect(siege.conditions?.zombi.mind).toMatchObject({ speech: false, memories: false });
    expect(siege.conditions?.zombi.controller).toBeUndefined();
    expect(siege.conditions?.muerto_errante.controller).toBe('rules');
    expect(load('zombie-outbreak').conditions?.zombie.mind?.speech).toBe(false);
    expect(load('kepler-station').conditions?.poseido.mind?.goals?.length).toBeGreaterThan(0);
  });

  it('El asedio de San Lorenzo validates cleanly and lasts five days', async () => {
    const { parse } = await import('yaml');
    const cfg = parse(readFileSync(new URL('../../scenarios/zombie-siege/config.yaml', import.meta.url), 'utf8')) as ScenarioConfig;
    expect(validateScenario(cfg)).toEqual([]);
    expect(scenarioWarnings(cfg)).toEqual([]);
    expect(cfg.simulation.duration).toBe('120 hours');
    expect(cfg.rules?.filter((r) => (r.then as { end?: string })?.end)).toHaveLength(3);
  });
});

describe('changed minds', () => {
  it('flags unknown actions in a mind and unknown conditions in any_conditions', () => {
    const cfg = emptyScenario();
    cfg.conditions = { zombi: { mind: { goals: ['morder'], actions: ['move', 'volar'] } } };
    cfg.actions = { morder: { who: { any_conditions: ['zombi', 'vampiro'] } } };
    const messages = referenceIssues(cfg).map((i) => i.message);
    expect(messages).toContain('El estado zombi permite la acción «volar», que no existe.');
    expect(messages).toContain('La acción morder usa el estado «vampiro», que no existe.');
    expect(messages.some((m) => m.includes('«move»'))).toBe(false);
  });
});
