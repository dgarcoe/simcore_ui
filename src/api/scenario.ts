// Scenario configuration as Simcore stores it (the YAML structure accepted by
// POST /api/scenarios, see simcore/config/schema.py), plus helpers to preview
// it as a map before it runs.

import type { Environment, Location } from './types';

export interface PersonalityConfig {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

export interface AgentConfig {
  name: string;
  age?: number;
  profession?: string;
  personality?: Partial<PersonalityConfig>;
  goals?: string[];
  starting_location?: string;
  resources?: Record<string, number>;
  backstory?: string;
}

export interface LocationConfig {
  name: string;
  type?: string;
  position?: [number, number];
  capacity?: number;
  properties?: Record<string, unknown>;
  city?: string;
  virtual?: boolean;
}

export interface ScheduledEventConfig {
  tick: number;
  type: string;
  description: string;
  effects?: Record<string, unknown>;
}

export interface ScenarioConfig {
  simulation: {
    name: string;
    description?: string;
    time_step?: string;
    duration?: string;
    seed?: number;
    language?: string;
  };
  llm?: { model?: string; temperature?: number; cache?: boolean; [k: string]: unknown };
  environment: {
    type?: string;
    size?: [number, number];
    global_state?: Record<string, unknown>;
    locations: LocationConfig[];
  };
  agents: AgentConfig[];
  events?: { scheduled?: ScheduledEventConfig[]; injectable?: boolean };
}

export const LOCATION_TYPES = [
  'residential',
  'commercial',
  'healthcare',
  'education',
  'social',
  'government',
  'administrative',
  'industrial',
  'storage',
  'engineering',
  'transport',
  'military',
  'agricultural',
  'leisure',
  'generic',
];

export const DEFAULT_PERSONALITY: PersonalityConfig = {
  openness: 0.5,
  conscientiousness: 0.5,
  extraversion: 0.5,
  agreeableness: 0.5,
  neuroticism: 0.5,
};

export function emptyScenario(): ScenarioConfig {
  return {
    simulation: { name: '', description: '', time_step: '1 hour', duration: '2 days', seed: 42, language: 'es' },
    llm: { model: 'ollama/qwen2.5:7b', temperature: 0.8, cache: true },
    environment: {
      type: 'grid',
      size: [12, 12],
      global_state: {},
      locations: [
        { name: 'Plaza', type: 'social', position: [5, 5], capacity: 30, properties: { description: '' } },
        { name: 'Casas', type: 'residential', position: [2, 8], capacity: 20, properties: { description: '' } },
      ],
    },
    agents: [
      {
        name: 'Ana',
        age: 34,
        profession: 'doctor',
        personality: { ...DEFAULT_PERSONALITY },
        goals: [''],
        starting_location: 'Plaza',
        resources: {},
        backstory: '',
      },
    ],
    events: { scheduled: [] },
  };
}

/**
 * Sets the LLM model; the reflection model follows it unless it was set to
 * something else on purpose (built-in scenarios set both to the same model).
 */
export function setModel(cfg: ScenarioConfig, model: string): void {
  const llm = (cfg.llm ??= {});
  const prev = llm.model;
  if (!llm.reflection_model || llm.reflection_model === prev) llm.reflection_model = model;
  llm.model = model;
}

/** The environment Simcore would build from this config (as /api/state reports it). */
export function configToEnvironment(cfg: ScenarioConfig): Environment {
  const [width, height] = cfg.environment.size ?? [20, 20];
  const locations: Record<string, Location> = {};
  for (const l of cfg.environment.locations ?? []) {
    if (!l.name) continue;
    const occupants = cfg.agents.filter((a) => a.starting_location === l.name).map((a) => agentId(a.name));
    locations[l.name] = {
      name: l.name,
      type: l.type ?? 'generic',
      position: [l.position?.[0] ?? 0, l.position?.[1] ?? 0],
      capacity: l.capacity ?? 50,
      city: l.city ?? '',
      virtual: !!l.virtual,
      occupants,
      occupant_count: occupants.length,
      properties: l.properties ?? {},
    };
  }
  return { width, height, locations, global_state: cfg.environment.global_state ?? {} };
}

/** Simcore derives agent ids from names (simcore/agents/agent.py). */
export function agentId(name: string): string {
  return name.toLowerCase().replace(/ /g, '_');
}

/** What the map generator can learn from the agents of a scenario. */
export interface MapHints {
  /** Agent names that start in each location. */
  residents: Record<string, string[]>;
  /** Resource names held by the agents that start in each location. */
  resources: Record<string, string[]>;
}

export function mapHints(cfg: ScenarioConfig | null | undefined): MapHints {
  const hints: MapHints = { residents: {}, resources: {} };
  for (const a of cfg?.agents ?? []) {
    const loc = a.starting_location;
    if (!loc) continue;
    (hints.residents[loc] ??= []).push(a.name);
    for (const [k, v] of Object.entries(a.resources ?? {})) {
      if (Number(v) > 0 && !(hints.resources[loc] ??= []).includes(k)) hints.resources[loc].push(k);
    }
  }
  return hints;
}

export function professions(cfg: ScenarioConfig | null | undefined): Record<string, string> {
  return Object.fromEntries((cfg?.agents ?? []).map((a) => [a.name, a.profession ?? '']));
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export function validateScenario(cfg: ScenarioConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!cfg.simulation.name?.trim()) issues.push({ path: 'simulation.name', message: 'El escenario necesita un nombre.' });

  const locs = cfg.environment.locations ?? [];
  const physical = locs.filter((l) => !l.virtual);
  if (physical.length === 0) issues.push({ path: 'environment.locations', message: 'Añade al menos un lugar físico.' });
  const names = new Set<string>();
  const [w, h] = cfg.environment.size ?? [20, 20];
  locs.forEach((l, i) => {
    if (!l.name?.trim()) issues.push({ path: `locations.${i}`, message: `El lugar #${i + 1} no tiene nombre.` });
    else if (names.has(l.name)) issues.push({ path: `locations.${i}`, message: `Hay dos lugares llamados «${l.name}».` });
    names.add(l.name);
    const [x, y] = l.position ?? [0, 0];
    if (!l.virtual && (x < 0 || y < 0 || x >= w || y >= h))
      issues.push({ path: `locations.${i}`, message: `«${l.name}» está fuera de la cuadrícula ${w}×${h}.` });
  });

  if (cfg.agents.length === 0) issues.push({ path: 'agents', message: 'Añade al menos un agente.' });
  const agentNames = new Set<string>();
  cfg.agents.forEach((a, i) => {
    if (!a.name?.trim()) issues.push({ path: `agents.${i}`, message: `El agente #${i + 1} no tiene nombre.` });
    else if (agentNames.has(a.name)) issues.push({ path: `agents.${i}`, message: `Hay dos agentes llamados «${a.name}».` });
    agentNames.add(a.name);
    if (a.starting_location && !names.has(a.starting_location))
      issues.push({ path: `agents.${i}`, message: `${a.name || 'Un agente'} empieza en «${a.starting_location}», que no existe.` });
  });

  for (const [i, e] of (cfg.events?.scheduled ?? []).entries()) {
    if (!e.description?.trim()) issues.push({ path: `events.${i}`, message: `El suceso #${i + 1} no tiene descripción.` });
  }
  return issues;
}

/** Strips empty strings the form leaves behind so Simcore gets a clean payload. */
export function cleanScenario(cfg: ScenarioConfig): ScenarioConfig {
  return {
    ...cfg,
    agents: cfg.agents.map((a) => ({
      ...a,
      goals: (a.goals ?? []).map((g) => g.trim()).filter(Boolean),
    })),
    events: {
      ...cfg.events,
      scheduled: (cfg.events?.scheduled ?? []).filter((e) => e.description?.trim()),
    },
  };
}
