// Mirrors the payloads produced by Simcore's FastAPI server
// (simcore/server/api.py) and event bus (simcore/engine/events.py).

export type EventType =
  | 'tick_start'
  | 'tick_end'
  | 'agent_action'
  | 'agent_speak'
  | 'agent_move'
  | 'agent_post'
  | 'interaction'
  | 'environment_change'
  | 'scheduled_event'
  | 'injected_event'
  | 'simulation_start'
  | 'simulation_end'
  | 'reflection'
  // Agent life cycle (Simcore forks with health/deaths/arrivals; older versions never send them).
  | 'agent_spawn'
  | 'agent_death'
  | 'agent_depart'
  // Items (Simcore forks with inventories).
  | 'item_transfer'
  | 'trade_offer'
  | 'trade_result'
  // Conditions (infected, zombie…) of Simcore forks with scenario conditions.
  | 'condition_change'
  // Needs, world rules and place state.
  | 'need_change'
  | 'place_change'
  | 'rule_fired'
  // Plans, beliefs, secrets and rumors.
  | 'agent_plan'
  | 'belief_shared'
  | 'speech_ignored';

export interface Belief {
  text: string;
  /** Who told it ('' = known from the start, 'rumor' = a rumor). */
  source: string;
  /** Ground truth when known; null = unknown (maybe a lie). */
  truth: boolean | null;
  secret: boolean;
  tick: number;
}

export interface HazardInfo {
  label?: string;
  per_tick?: Record<string, number>;
  condition?: string;
}

/** Catalog entry of a scenario condition, as exposed in the state. */
export interface ConditionInfo {
  description?: string;
  appearance?: string;
  color?: string;
  controller?: 'llm' | 'rules';
  becomes?: string;
  duration?: number | null;
}

export type TransferKind = 'give' | 'take' | 'drop' | 'use' | 'trade' | 'produce' | 'effect';

/** Catalog entry of an item (scenario `items`). */
export interface ItemInfo {
  description?: string;
  consumable?: boolean;
  on_use?: Partial<Record<'health' | 'energy' | 'mood', number>>;
}

export interface TradeOfferInfo {
  from: string;
  to: string;
  item: string;
  amount: number;
  ask_item: string;
  ask_amount: number;
  expires: number;
}

/** alive (default), dead (body stays where it fell) or departed (left the simulation). */
export type AgentStatus = 'alive' | 'dead' | 'departed';

export interface SimEvent {
  type: EventType;
  tick: number;
  data: Record<string, any>;
  source: string;
}

export interface Personality {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

export interface AgentState {
  mood: number; // -1..1
  energy: number; // 0..1
  location: string;
  current_action: string | null;
  resources: Record<string, unknown>;
  /** 0 (dead) .. 1; absent on Simcore versions without health. */
  health?: number;
  status?: AgentStatus;
  /** Scenario conditions → ticks left (null = until removed). */
  conditions?: Record<string, number | null>;
  /** Scenario needs → level 0..1. */
  needs?: Record<string, number>;
  beliefs?: Belief[];
  plan?: { steps: string[]; current: number } | null;
}

export interface Agent {
  id: string;
  name: string;
  profession?: string;
  location: string;
  status?: AgentStatus;
  personality: Personality;
  state: AgentState;
  relationships: Record<string, string>;
  /** Typed relationships: name → brother, partner, rival… */
  relationship_kinds?: Record<string, string>;
  memory_summary: string;
}

export interface Location {
  name: string;
  type: string;
  position: [number, number];
  capacity: number;
  city: string;
  virtual: boolean;
  occupants: string[];
  occupant_count: number;
  properties: Record<string, unknown>;
  /** Items lying here (Simcore with inventories). */
  stock?: Record<string, number>;
  produces?: Record<string, number>;
  closed?: boolean;
  access?: Record<string, unknown> | null;
  hazard?: HazardInfo | null;
}

export interface Environment {
  width: number;
  height: number;
  locations: Record<string, Location>;
  global_state: Record<string, unknown>;
}

export interface Clock {
  tick: number;
  max_ticks: number;
  time: string;
  progress: number;
  elapsed_hours: number;
}

export interface SimState {
  clock: Clock;
  agents: Record<string, Agent>;
  environment: Environment;
  llm_stats?: Record<string, unknown>;
  /** Item catalog and pending trade offers (Simcore with inventories). */
  items?: Record<string, ItemInfo>;
  offers?: TradeOfferInfo[];
  conditions?: Record<string, ConditionInfo>;
  actions?: Record<string, { description?: string; target?: 'agent' | 'none' }>;
  needs?: Record<string, { label?: string }>;
  pending_arrivals?: string[];
}

export interface ScenarioMeta {
  name: string;
  description: string;
  agents: number;
  locations: number;
  duration: string;
  language: string;
  llm_model: string;
}

export interface ScenarioRecord {
  id: string;
  builtin: boolean;
  meta: ScenarioMeta;
  data: Record<string, any>;
}
