// Mirrors the payloads produced by Simcore's FastAPI server
// (simcore/server/api.py) and event bus (simcore/engine/events.py).

import type { RpgSheet } from '../store/rpg';

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
  | 'speech_ignored'
  | 'agent_search'
  | 'story_moment'
  | 'story_chapter'
  | 'faction_change'
  | 'vote_called'
  | 'vote_result'
  // Role-playing rules: d20 checks and level ups.
  | 'dice_roll'
  | 'level_up';

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
  visible?: boolean;
  drops?: boolean;
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
  /** Sentiment -1..1 towards each person (Simcore versions that report it). */
  relationship_scores?: Record<string, number>;
  memory_summary: string;
  /** A condition changed who this agent is (it still thinks with the LLM). */
  mind?: { condition: string; identity: string; goals: string[]; speech: boolean; memories: boolean };
  /** Group it belongs to, public reputation -1..1, how it feels and the favors it owes. */
  faction?: string;
  reputation?: number;
  emotion?: string;
  emotion_toward?: string;
  owes?: Array<{ to: string; what: string }>;
  /** Who it is looking for, the clues it has and where it already looked. */
  search?: { target: string; why: string; found: boolean; checked: string[]; clues: SearchClue[] };
  /** Character sheet (scenarios with role-playing rules). */
  rpg?: RpgSheet;
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
  /** Groups and open votes (Simcore with a society). */
  society?: SocietyState;
  /** Who carries each coveted item and for how many ticks in a row. */
  holders?: Record<string, { agent: string; since: number; ticks: number }>;
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
  /** A built-in scenario with saved edits (they can be dropped to restore the original). */
  modified?: boolean;
  meta: ScenarioMeta;
  data: Record<string, any>;
}

export interface SearchClue {
  /** Who gave the clue ("you" when the seeker saw them). */
  by: string;
  place: string;
  ago: number;
}

export interface SocietyState {
  factions: Record<string, { goal: string; leader: string; members: string[]; rivals: string[]; color: string }>;
  votes: Array<{ question: string; options: string[]; place: string; until: number; votes: number }>;
}
