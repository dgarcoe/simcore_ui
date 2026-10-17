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
  /** 0..1 (Simcore with agent life cycle). */
  health?: number;
  /** Tick at which the agent enters (0 = from the start). */
  arrives_at?: number;
  /** Scenario conditions it starts with. */
  conditions?: string[];
}

export interface LocationConfig {
  name: string;
  type?: string;
  position?: [number, number];
  capacity?: number;
  properties?: Record<string, unknown>;
  city?: string;
  virtual?: boolean;
  /** Items lying here that anyone can take. */
  stock?: Record<string, number>;
  /** Items added to whoever works here, per work action. */
  produces?: Record<string, number>;
}

/** Item catalog entry (Simcore with inventories). */
export interface ItemConfig {
  description?: string;
  consumable?: boolean;
  on_use?: Partial<Record<'health' | 'energy' | 'mood', number>>;
  /** Conditions removed from whoever it's used on. */
  cures?: string[];
}

export type Stat = 'health' | 'energy' | 'mood';
export const STATS: Array<[Stat, string]> = [
  ['health', 'Salud'],
  ['energy', 'Energía'],
  ['mood', 'Ánimo'],
];

export interface Requirement {
  conditions?: string[];
  not_conditions?: string[];
  professions?: string[];
  items?: Record<string, number>;
}

export interface Outcome {
  health?: number;
  energy?: number;
  mood?: number;
  add_conditions?: string[];
  remove_conditions?: string[];
  items?: Record<string, number>;
  kill?: boolean;
}

/** Scenario condition (infected, zombie…). */
export interface ConditionConfig {
  description?: string;
  appearance?: string;
  per_tick?: Partial<Record<Stat, number>>;
  duration?: number | null;
  becomes?: string;
  contagion?: { chance?: number; via?: 'interaction' | 'place' } | null;
  controller?: 'llm' | 'rules';
  rules?: { action?: string; targets?: Requirement; seek?: boolean; wander?: number };
  color?: string;
}

/** Scenario action (bite, shoot, treat…). */
export interface ActionConfig {
  description?: string;
  target?: 'agent' | 'none';
  who?: Requirement;
  target_requires?: Requirement;
  chance?: number;
  cost?: Record<string, number>;
  on_target?: Outcome;
  on_self?: Outcome;
  world?: Record<string, unknown>;
  message?: string;
  fail_message?: string;
}

export const BUILTIN_ACTIONS = ['move', 'speak', 'trade', 'interact', 'wait', 'observe', 'work', 'rest', 'post', 'custom', 'give', 'take', 'drop', 'use', 'accept', 'decline'];

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
  items?: Record<string, ItemConfig>;
  conditions?: Record<string, ConditionConfig>;
  actions?: Record<string, ActionConfig>;
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

/**
 * A name not used yet, based on `name`: "Habitante" → "Habitante 2",
 * "Habitante 2" → "Habitante 3" (trailing numbers are replaced, not stacked).
 */
export function uniqueName(name: string, taken: string[]): string {
  const base = name.replace(/(\s+\d+)+\s*$/, '').trim() || name.trim() || 'Agente';
  const used = new Set(taken);
  for (let n = 2; ; n++) if (!used.has(`${base} ${n}`)) return `${base} ${n}`;
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
    const fx = effectsToForm(e.effects);
    if (fx.spawn.some((s) => !String(s.name ?? '').trim()))
      issues.push({ path: `events.${i}`, message: `Una llegada del suceso #${i + 1} no tiene nombre.` });
    for (const r of [...fx.addCondition, ...fx.removeCondition])
      if (!cfg.conditions?.[r.condition]) issues.push({ path: `events.${i}`, message: `El suceso #${i + 1} usa el estado «${r.condition}», que no existe.` });
    for (const t of [
      ...fx.kill,
      ...fx.depart,
      ...fx.health.map((h) => h.target),
      ...fx.items.map((r) => r.target),
      ...[...fx.addCondition, ...fx.removeCondition].map((r) => r.target),
    ]) {
      const known = t === 'all' || (t.startsWith('location:') ? names.has(t.slice(9)) : agentNames.has(t));
      if (!known) issues.push({ path: `events.${i}`, message: `El suceso #${i + 1} afecta a «${targetLabel(t)}», que no existe.` });
    }
  }
  issues.push(...referenceIssues(cfg));
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

// ── Event effects (Simcore with agent life cycle) ───────────────────────

export interface SpawnSpec {
  name: string;
  profession?: string;
  starting_location?: string;
  count?: number;
}

/** Editable view of a scheduled event's `effects`. */
export interface EffectsForm {
  kill: string[];
  depart: string[];
  health: Array<{ target: string; delta: number }>;
  spawn: SpawnSpec[];
  /** Conditions added / removed: one row per target and condition. */
  addCondition: Array<{ target: string; condition: string }>;
  removeCondition: Array<{ target: string; condition: string }>;
  /** Items added (+) or removed (-) for an agent or a place ("location:<name>"). */
  items: Array<{ target: string; item: string; delta: number }>;
  /** Other keys: written to the world's global_state. */
  world: Record<string, unknown>;
}

const AGENT_EFFECTS = ['kill', 'depart', 'health', 'spawn', 'items', 'add_condition', 'remove_condition'];

function conditionRows(v: unknown): Array<{ target: string; condition: string }> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
  return Object.entries(v as Record<string, unknown>).flatMap(([target, c]) => names(c).map((condition) => ({ target, condition })));
}

function conditionMap(rows: Array<{ target: string; condition: string }>): Record<string, string[]> | undefined {
  const out: Record<string, string[]> = {};
  for (const r of rows) if (r.target && r.condition && !(out[r.target] ??= []).includes(r.condition)) out[r.target].push(r.condition);
  return Object.keys(out).length ? out : undefined;
}

function names(v: unknown): string[] {
  return typeof v === 'string' ? [v] : Array.isArray(v) ? v.map(String) : [];
}

export function effectsToForm(effects: Record<string, unknown> | undefined): EffectsForm {
  const fx = effects ?? {};
  const health = fx.health && typeof fx.health === 'object' && !Array.isArray(fx.health) ? (fx.health as Record<string, unknown>) : {};
  const spawn = Array.isArray(fx.spawn) ? fx.spawn : fx.spawn ? [fx.spawn] : [];
  const items = fx.items && typeof fx.items === 'object' && !Array.isArray(fx.items) ? (fx.items as Record<string, Record<string, unknown>>) : {};
  return {
    kill: names(fx.kill),
    depart: names(fx.depart),
    health: Object.entries(health).map(([target, delta]) => ({ target, delta: Number(delta) || 0 })),
    spawn: spawn.filter((x): x is SpawnSpec => !!x && typeof x === 'object'),
    addCondition: conditionRows(fx.add_condition),
    removeCondition: conditionRows(fx.remove_condition),
    items: Object.entries(items).flatMap(([target, changes]) =>
      Object.entries(changes ?? {}).map(([item, delta]) => ({ target, item, delta: Number(delta) || 0 })),
    ),
    world: Object.fromEntries(Object.entries(fx).filter(([k]) => !AGENT_EFFECTS.includes(k))),
  };
}

/** Back to Simcore's shape, leaving out empty parts (no `effects` at all when empty). */
export function formToEffects(f: EffectsForm): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = { ...f.world };
  if (f.kill.length) out.kill = f.kill;
  if (f.depart.length) out.depart = f.depart;
  const health = f.health.filter((h) => h.target && h.delta);
  if (health.length) out.health = Object.fromEntries(health.map((h) => [h.target, h.delta]));
  // Arrivals are kept even while their name is being typed; validateScenario flags empty ones.
  if (f.spawn.length) out.spawn = f.spawn;
  const items: Record<string, Record<string, number>> = {};
  for (const r of f.items) if (r.target && r.item.trim() && r.delta) (items[r.target] ??= {})[r.item.trim()] = r.delta;
  if (Object.keys(items).length) out.items = items;
  const add = conditionMap(f.addCondition);
  if (add) out.add_condition = add;
  const remove = conditionMap(f.removeCondition);
  if (remove) out.remove_condition = remove;
  return Object.keys(out).length ? out : undefined;
}

/** "all", "location:X" or an agent name, in words. */
export function targetLabel(target: string): string {
  if (target === 'all') return 'Todos';
  if (target.startsWith('location:')) return `Todos en ${target.slice('location:'.length)}`;
  return target;
}

// ── Items ───────────────────────────────────────────────────────────────

/** Every item name the scenario mentions (inventories, stock, production, events). */
export function itemsUsed(cfg: ScenarioConfig): string[] {
  const names = new Set<string>();
  const add = (r: Record<string, unknown> | undefined) => Object.keys(r ?? {}).forEach((k) => names.add(k));
  cfg.agents.forEach((a) => add(a.resources));
  cfg.environment.locations.forEach((l) => {
    add(l.stock);
    add(l.produces);
  });
  for (const e of cfg.events?.scheduled ?? []) {
    const fx = effectsToForm(e.effects);
    fx.items.forEach((r) => names.add(r.item));
    fx.spawn.forEach((s) => add((s as { resources?: Record<string, number> }).resources));
  }
  return [...names].filter(Boolean).sort();
}

/** Non-blocking hints: items used but missing from the catalog (they work, without description or use). */
export function scenarioWarnings(cfg: ScenarioConfig): string[] {
  const catalog = cfg.items ?? {};
  if (!Object.keys(catalog).length) return [];
  const missing = itemsUsed(cfg).filter((n) => !catalog[n]);
  return missing.length ? [`Objetos sin ficha en el catálogo (sin descripción ni uso): ${missing.join(', ')}.`] : [];
}

/** Conditions and actions must exist where they are referenced (Simcore rejects the scenario otherwise). */
export function referenceIssues(cfg: ScenarioConfig): ValidationIssue[] {
  const conds = cfg.conditions ?? {};
  const acts = cfg.actions ?? {};
  const issues: ValidationIssue[] = [];
  const need = (list: string[] | undefined, where: string, path: string) => {
    for (const c of list ?? []) if (c && !conds[c]) issues.push({ path, message: `${where} usa el estado «${c}», que no existe.` });
  };
  cfg.agents.forEach((a, i) => need(a.conditions, a.name || `El agente #${i + 1}`, `agents.${i}`));
  Object.entries(cfg.items ?? {}).forEach(([k, it]) => need(it.cures, `El objeto ${k}`, `items.${k}`));
  for (const [k, a] of Object.entries(acts)) {
    if (BUILTIN_ACTIONS.includes(k)) issues.push({ path: `actions.${k}`, message: `La acción «${k}» choca con una acción básica de Simcore.` });
    for (const r of [a.who, a.target_requires]) {
      need(r?.conditions, `La acción ${k}`, `actions.${k}`);
      need(r?.not_conditions, `La acción ${k}`, `actions.${k}`);
    }
    for (const o of [a.on_target, a.on_self]) {
      need(o?.add_conditions, `La acción ${k}`, `actions.${k}`);
      need(o?.remove_conditions, `La acción ${k}`, `actions.${k}`);
    }
  }
  for (const [k, c] of Object.entries(conds)) {
    if (c.becomes) need([c.becomes], `El estado ${k}`, `conditions.${k}`);
    if (c.rules?.action && !acts[c.rules.action])
      issues.push({ path: `conditions.${k}`, message: `El estado ${k} usa la acción «${c.rules.action}», que no existe.` });
  }
  return issues;
}
