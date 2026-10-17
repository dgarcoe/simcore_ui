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
  | 'agent_depart';

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
