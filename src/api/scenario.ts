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
  /** Initial level of scenario needs, 0..1. */
  needs?: Record<string, number>;
  /** Typed relationships: name → {type, sentiment}. */
  relationships?: Record<string, { type?: string; sentiment?: number }>;
  /** What it believes (true: ground truth for the UI; agents never see it). */
  beliefs?: Array<string | { text: string; true?: boolean | null }>;
  /** True things it keeps to itself. */
  secrets?: string[];
  /** Group it starts in (created if it isn't in `factions`). */
  faction?: string;
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
  closed?: boolean;
  access?: Requirement | null;
  hazard?: HazardConfig | null;
}

export interface HazardConfig {
  label?: string;
  per_tick?: Partial<Record<Stat, number>>;
  condition?: string;
}

export interface NeedConfig {
  label?: string;
  grows?: number;
  relief?: number;
  satisfied_by?: { items?: string[]; actions?: string[]; places?: string[] };
  at_max?: Partial<Record<Stat, number>>;
  who?: Requirement;
}

export type CompareOp = 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'ne';
export const COMPARE_OPS: Array<[CompareOp, string]> = [
  ['lt', '<'],
  ['lte', '≤'],
  ['gt', '>'],
  ['gte', '≥'],
  ['eq', '='],
  ['ne', '≠'],
];
export type Compare = Partial<Record<CompareOp, number | string | boolean>>;

export interface RuleWhen {
  at?: number;
  every?: number;
  from?: number;
  until?: number;
  global?: Record<string, Compare>;
  alive?: Compare;
  count?: Compare & { condition?: string; not_condition?: string; location?: string };
  place?: Record<string, { closed?: boolean; hazard?: boolean; occupants?: Compare }>;
}

export interface RuleConfig {
  description?: string;
  when?: RuleWhen;
  then?: Record<string, unknown>;
  once?: boolean;
}

/** Item catalog entry (Simcore with inventories). */
export interface ItemConfig {
  description?: string;
  consumable?: boolean;
  on_use?: Partial<Record<'health' | 'energy' | 'mood', number>>;
  /** Conditions removed from whoever it's used on. */
  cures?: string[];
  /** Makes "attack" stronger. */
  weapon?: { damage?: number; chance?: number; ammo?: string };
}

/** A group agents start in; others can be founded during the run. */
export interface FactionConfig {
  goal?: string;
  leader?: string;
  members?: string[];
  rivals?: string[];
  color?: string;
}

/** A matter that can be put to the vote, with the effects of each outcome. */
export interface VoteConfig {
  question: string;
  options?: Record<string, Record<string, unknown>>;
  duration?: number;
  from?: number;
  once?: boolean;
}

export interface SocietyConfig {
  spontaneous_groups?: boolean;
  healers?: string[];
  heal_removes?: string[];
}

export type DayPhase = 'night' | 'morning' | 'day' | 'evening';
export const DAY_PHASES: Array<[DayPhase, string]> = [
  ['night', 'Noche'],
  ['morning', 'Mañana'],
  ['day', 'Día'],
  ['evening', 'Tarde'],
];
/** By agent name, profession (part of the word) or "*": time of day → action → places. */
export type Routines = Record<string, Partial<Record<DayPhase, Record<string, string[]>>>>;

export type Stat = 'health' | 'energy' | 'mood';
export const STATS: Array<[Stat, string]> = [
  ['health', 'Salud'],
  ['energy', 'Energía'],
  ['mood', 'Ánimo'],
];

export interface Requirement {
  conditions?: string[];
  /** At least one of these. */
  any_conditions?: string[];
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
  /** With the LLM controller: the agent becomes someone else (a zombie that still thinks). */
  mind?: MindConfig;
  color?: string;
}

export interface MindConfig {
  /** Who it is now; {name} and {profession} are replaced. */
  identity?: string;
  goals?: string[];
  /** false: can't speak, whisper, invite, interact, trade or give (default true). */
  speech?: boolean;
  /** false: forgets who it was — no memories, relationships, beliefs or plans (default true). */
  memories?: boolean;
  /** If set, the only actions it may take. */
  actions?: string[];
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

export const BUILTIN_ACTIONS = ['move', 'speak', 'trade', 'interact', 'wait', 'observe', 'work', 'rest', 'post', 'custom', 'give', 'take', 'drop', 'use', 'accept', 'decline', 'whisper', 'invite', 'follow', 'find', 'attack', 'heal', 'found_group', 'join', 'leave', 'expel', 'call_vote', 'vote'];

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
    /** Daily plans (extra LLM calls). */
    planning?: boolean;
    plan_every?: number;
    /** A narrator writes a chapter every chapter_every ticks (one LLM call each). */
    story?: boolean;
    chapter_every?: number;
    /** What agents know of where the others are. */
    awareness?: 'local' | 'full';
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
  needs?: Record<string, NeedConfig>;
  rules?: RuleConfig[];
  factions?: Record<string, FactionConfig>;
  votes?: Record<string, VoteConfig>;
  society?: SocietyConfig;
  routines?: Routines;
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
      ...fx.rumor.map((r) => r.target),
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
  /** Need changes (e.g. a feast: hunger -1). */
  needs: Array<{ target: string; need: string; delta: number }>;
  /** Place changes: close/open, set/remove a hazard. */
  places: Array<{ place: string; closed?: boolean; hazard?: HazardConfig | null }>;
  /** Numeric world variables to add to. */
  adjust: Array<{ key: string; delta: number }>;
  /** Ends the run with this text (rules). */
  end: string;
  /** Rumors planted in agents or places. */
  rumor: Array<{ target: string; text: string; truth: boolean | null }>;
  /** Items added (+) or removed (-) for an agent or a place ("location:<name>"). */
  items: Array<{ target: string; item: string; delta: number }>;
  /** Other keys: written to the world's global_state. */
  world: Record<string, unknown>;
}

const AGENT_EFFECTS = ['kill', 'depart', 'health', 'spawn', 'items', 'add_condition', 'remove_condition', 'needs', 'locations', 'adjust', 'end', 'rumor'];

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
    needs: Object.entries((fx.needs ?? {}) as Record<string, Record<string, unknown>>).flatMap(([target, ch]) =>
      Object.entries(ch ?? {}).map(([need, delta]) => ({ target, need, delta: Number(delta) || 0 })),
    ),
    places: Object.entries((fx.locations ?? {}) as Record<string, { closed?: boolean; hazard?: HazardConfig | null }>).map(([place, ch]) => ({
      place,
      ...('closed' in (ch ?? {}) ? { closed: !!ch.closed } : {}),
      ...('hazard' in (ch ?? {}) ? { hazard: ch.hazard ?? null } : {}),
    })),
    adjust: Object.entries((fx.adjust ?? {}) as Record<string, unknown>).map(([key, delta]) => ({ key, delta: Number(delta) || 0 })),
    end: typeof fx.end === 'string' ? fx.end : '',
    rumor: Object.entries((fx.rumor ?? {}) as Record<string, string | { text?: string; true?: boolean | null }>).map(([target, r]) =>
      typeof r === 'string' ? { target, text: r, truth: null } : { target, text: r?.text ?? '', truth: r?.true ?? null },
    ),
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
  const needs: Record<string, Record<string, number>> = {};
  for (const r of f.needs) if (r.target && r.need && r.delta) (needs[r.target] ??= {})[r.need] = r.delta;
  if (Object.keys(needs).length) out.needs = needs;
  const places: Record<string, Record<string, unknown>> = {};
  for (const r of f.places) {
    if (!r.place) continue;
    const ch: Record<string, unknown> = {};
    if (r.closed !== undefined) ch.closed = r.closed;
    if (r.hazard !== undefined) ch.hazard = r.hazard;
    if (Object.keys(ch).length) places[r.place] = ch;
  }
  if (Object.keys(places).length) out.locations = places;
  const adjust = Object.fromEntries(f.adjust.filter((a) => a.key.trim() && a.delta).map((a) => [a.key.trim(), a.delta]));
  if (Object.keys(adjust).length) out.adjust = adjust;
  if (f.end.trim()) out.end = f.end.trim();
  const rumor: Record<string, unknown> = {};
  for (const r of f.rumor) if (r.target && r.text.trim()) rumor[r.target] = r.truth === null ? r.text.trim() : { text: r.text.trim(), true: r.truth };
  if (Object.keys(rumor).length) out.rumor = rumor;
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
  const names = new Set(cfg.agents.map((a) => a.name));
  for (const [k, f] of Object.entries(cfg.factions ?? {})) {
    for (const m of f.members ?? []) if (!names.has(m)) issues.push({ path: `factions.${k}`, message: `El grupo ${k} tiene un miembro que no existe: «${m}».` });
    if (f.leader && !names.has(f.leader)) issues.push({ path: `factions.${k}`, message: `El líder de ${k} («${f.leader}») no existe.` });
  }
  for (const [who, phases] of Object.entries(cfg.routines ?? {}))
    for (const todo of Object.values(phases ?? {}))
      for (const places of Object.values(todo ?? {}))
        for (const p of places) if (!cfg.environment.locations.some((l) => l.name === p)) issues.push({ path: `routines.${who}`, message: `La rutina de ${who} va a «${p}», que no existe.` });
  for (const [k, c] of Object.entries(conds)) {
    const t = c.rules?.targets;
    for (const list of [t?.conditions, t?.any_conditions, t?.not_conditions]) need(list, `El estado ${k}`, `conditions.${k}`);
    for (const a of c.mind?.actions ?? [])
      if (!BUILTIN_ACTIONS.includes(a) && !acts[a]) issues.push({ path: `conditions.${k}`, message: `El estado ${k} permite la acción «${a}», que no existe.` });
  }
  for (const [k, a] of Object.entries(acts)) {
    if (BUILTIN_ACTIONS.includes(k)) issues.push({ path: `actions.${k}`, message: `La acción «${k}» choca con una acción básica de Simcore.` });
    for (const r of [a.who, a.target_requires]) {
      need(r?.conditions, `La acción ${k}`, `actions.${k}`);
      need(r?.any_conditions, `La acción ${k}`, `actions.${k}`);
      need(r?.not_conditions, `La acción ${k}`, `actions.${k}`);
    }
    for (const o of [a.on_target, a.on_self]) {
      need(o?.add_conditions, `La acción ${k}`, `actions.${k}`);
      need(o?.remove_conditions, `La acción ${k}`, `actions.${k}`);
    }
  }
  const places = new Set(cfg.environment.locations.map((l) => l.name));
  const needs = cfg.needs ?? {};
  const effectIssues = (raw: Record<string, unknown> | undefined, where: string, path: string) => {
    const fx = effectsToForm(raw);
    for (const r of fx.places) if (!places.has(r.place)) issues.push({ path, message: `${where} cambia el lugar «${r.place}», que no existe.` });
    for (const r of fx.needs) if (!needs[r.need]) issues.push({ path, message: `${where} usa la necesidad «${r.need}», que no existe.` });
    need(
      fx.places.map((r) => r.hazard?.condition ?? '').filter(Boolean),
      where,
      path,
    );
  };
  (cfg.events?.scheduled ?? []).forEach((e, i) => effectIssues(e.effects, `El suceso #${i + 1}`, `events.${i}`));
  for (const [k, v] of Object.entries(cfg.votes ?? {})) {
    if (!v.question?.trim()) issues.push({ path: `votes.${k}`, message: `La votación ${k} no tiene pregunta.` });
    for (const [opt, fx] of Object.entries(v.options ?? {})) effectIssues(fx, `La opción «${opt}» de ${k}`, `votes.${k}`);
  }
  (cfg.rules ?? []).forEach((r, i) => {
    const where = `La regla #${i + 1}`;
    effectIssues(r.then, where, `rules.${i}`);
    if (!r.then || !Object.keys(r.then).length) issues.push({ path: `rules.${i}`, message: `${where} no hace nada (añade consecuencias o un final).` });
    const c = r.when?.count;
    need([c?.condition ?? '', c?.not_condition ?? ''].filter(Boolean), where, `rules.${i}`);
    if (c?.location && !places.has(c.location)) issues.push({ path: `rules.${i}`, message: `${where} cuenta en «${c.location}», que no existe.` });
    for (const p of Object.keys(r.when?.place ?? {})) if (!places.has(p)) issues.push({ path: `rules.${i}`, message: `${where} mira el lugar «${p}», que no existe.` });
  });
  const agentNames = new Set(cfg.agents.map((a) => a.name));
  cfg.agents.forEach((a, i) => {
    for (const n of Object.keys(a.relationships ?? {}))
      if (!agentNames.has(n)) issues.push({ path: `agents.${i}`, message: `${a.name || `El agente #${i + 1}`} tiene relación con «${n}», que no existe.` });
    for (const n of Object.keys(a.needs ?? {})) if (!needs[n]) issues.push({ path: `agents.${i}`, message: `${a.name || `El agente #${i + 1}`} tiene la necesidad «${n}», que no existe.` });
  });
  cfg.environment.locations.forEach((l, i) => {
    need([l.hazard?.condition ?? ''].filter(Boolean), `El lugar ${l.name}`, `locations.${i}`);
    need([...(l.access?.conditions ?? []), ...(l.access?.not_conditions ?? [])], `El lugar ${l.name}`, `locations.${i}`);
  });
  for (const [k, n] of Object.entries(needs)) {
    for (const p of n.satisfied_by?.places ?? []) if (!places.has(p)) issues.push({ path: `needs.${k}`, message: `La necesidad ${k} usa el lugar «${p}», que no existe.` });
    for (const a of n.satisfied_by?.actions ?? [])
      if (!BUILTIN_ACTIONS.includes(a) && !acts[a]) issues.push({ path: `needs.${k}`, message: `La necesidad ${k} usa la acción «${a}», que no existe.` });
  }
  for (const [k, c] of Object.entries(conds)) {
    if (c.becomes) need([c.becomes], `El estado ${k}`, `conditions.${k}`);
    if (c.rules?.action && !acts[c.rules.action])
      issues.push({ path: `conditions.${k}`, message: `El estado ${k} usa la acción «${c.rules.action}», que no existe.` });
  }
  return issues;
}
