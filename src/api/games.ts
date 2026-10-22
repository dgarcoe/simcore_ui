// Games with players: dungeon masters (DM) create them from a scenario; players join with the
// game's code and configure their own agent. Mirrors simcore/server/games.py.

import type { AgentConfig, ScenarioConfig } from './scenario';
import type { SimEvent } from './types';

export const EDITABLE_FIELDS: Array<[string, string]> = [
  ['name', 'Nombre'],
  ['profession', 'Profesión'],
  ['age', 'Edad'],
  ['personality', 'Personalidad'],
  ['goals', 'Metas'],
  ['backstory', 'Historia'],
  ['secrets', 'Secretos'],
  ['attributes', 'Atributos (con presupuesto de puntos)'],
  ['skills', 'Habilidades'],
];

export const FIXED_FIELDS: Record<string, string> = {
  starting_location: 'dónde empieza',
  resources: 'qué lleva',
  conditions: 'sus estados',
  faction: 'su grupo',
  relationships: 'sus relaciones',
  beliefs: 'lo que cree',
  needs: 'sus necesidades',
  health: 'su salud',
  arrives_at: 'cuándo llega',
  level: 'su nivel',
};

export interface GameTemplate {
  editable: string[];
  /** For the DM: the values; for a player: only which fields the DM decides. */
  fixed: Record<string, unknown> | string[];
  attribute_budget: number;
  attribute_min: number;
  attribute_max: number;
  max_skills: number;
  professions: string[];
  max_text: number;
  max_goals: number;
}

export type GameStatus = 'open' | 'closed' | 'running' | 'finished';
export interface Publish {
  result: boolean;
  diary: boolean;
  replay: boolean;
}

export interface GamePlayer {
  id: string;
  display_name: string;
  agent: Partial<AgentConfig>;
  submitted: boolean;
  joined: string;
}

export interface Game {
  id: string;
  code: string;
  title: string;
  briefing: string;
  scenario_id: string;
  template: GameTemplate & { fixed: Record<string, unknown> };
  max_players: number;
  status: GameStatus;
  players: GamePlayer[];
  run_id: string | null;
  publish: Publish;
  created: string;
}

/** What a player sees of a game. */
export interface PublicGame {
  code: string;
  title: string;
  briefing: string;
  status: GameStatus;
  players: string[];
  max_players: number;
  template: GameTemplate & { fixed: string[] };
  published: Publish;
}

export interface PlayerResults {
  status: GameStatus;
  published: Publish;
  agent?: string;
  result?: { message: string; reason: string; ticks: number; alive: boolean };
  diary?: { scenario: { name?: string }; events: SimEvent[] };
  replay?: { scenario: { name?: string; description?: string }; config: ScenarioConfig; events: SimEvent[] };
}

async function call<T>(path: string, init?: RequestInit & { token?: string; body?: BodyInit | null }, payload?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  if (init?.token) headers['X-Player-Token'] = init.token;
  const res = await fetch(path, {
    ...init,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => null)) as (T & { detail?: string }) | null;
  if (!res.ok) throw new Error(data?.detail ?? `${res.status} ${res.statusText}`);
  return data as T;
}

// ── Dungeon masters ─────────────────────────────────────────────────────

export const authMe = () => call<{ required: boolean; dm: boolean }>('/api/auth/me');
export const login = (password: string) => call<{ dm: boolean }>('/api/auth/login', { method: 'POST' }, { password });
export const logout = () => call<{ dm: boolean }>('/api/auth/logout', { method: 'POST' }, {});

export const listGames = async () => (await call<{ games: Game[] }>('/api/games')).games;
export const createGame = (payload: Partial<Game>) => call<Game>('/api/games', { method: 'POST' }, payload);
export const updateGame = (id: string, payload: Partial<Game>) => call<Game>(`/api/games/${id}`, { method: 'PUT' }, payload);
export const deleteGame = (id: string) => call<{ deleted: boolean }>(`/api/games/${id}`, { method: 'DELETE' });
export const editPlayer = (id: string, player: string, payload: { agent?: Partial<AgentConfig>; submitted?: boolean; remove?: boolean }) =>
  call<Game>(`/api/games/${id}/players/${player}`, { method: 'POST' }, payload);
export const launchGame = (id: string, opts: { demo: boolean; speed: number }) =>
  call<{ status: string; run_id: string | null; name: string }>(`/api/games/${id}/launch`, { method: 'POST' }, opts);

// ── Players ─────────────────────────────────────────────────────────────

const code = (c: string) => encodeURIComponent(c.trim().toUpperCase());

export const playView = (c: string) => call<PublicGame>(`/api/play/${code(c)}`);
export const joinGame = (c: string, displayName: string) =>
  call<{ player_id: string; token: string }>(`/api/play/${code(c)}/join`, { method: 'POST' }, { display_name: displayName });
export const myAgent = (c: string, token: string) =>
  call<{ display_name: string; agent: Partial<AgentConfig>; submitted: boolean; status: GameStatus }>(`/api/play/${code(c)}/me`, { token });
export const saveMyAgent = (c: string, token: string, agent: Partial<AgentConfig>, submitted?: boolean) =>
  call<{ agent: Partial<AgentConfig>; submitted: boolean }>(`/api/play/${code(c)}/me`, { method: 'PUT', token }, { agent, submitted });
export const myResults = (c: string, token: string) => call<PlayerResults>(`/api/play/${code(c)}/results`, { token });

// ── Links and tokens ────────────────────────────────────────────────────

/** `#/jugar/K7QF-2M4P` (and `?yo=<token>` to come back from another device). */
export function parsePlayHash(hash: string): { code: string; token: string | null } | null {
  const m = /^#\/jugar\/([A-Za-z0-9-]+)(?:\?(.*))?$/.exec(hash);
  if (!m) return null;
  const token = new URLSearchParams(m[2] ?? '').get('yo');
  return { code: m[1].toUpperCase(), token };
}

export function gameLink(origin: string, gameCode: string, token?: string): string {
  return `${origin}/#/jugar/${gameCode}${token ? `?yo=${encodeURIComponent(token)}` : ''}`;
}

const TOKEN_KEY = (c: string) => `simcore:player:${c.toUpperCase()}`;

export function savedToken(c: string): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY(c));
  } catch {
    return null;
  }
}

export function saveToken(c: string, token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY(c), token);
  } catch {
    /* the personal link still works */
  }
}

/** Points spent above 10 (lowering an attribute gives points back). */
export function pointsSpent(attributes: Partial<Record<string, number>> | undefined): number {
  return Object.values(attributes ?? {}).reduce<number>((sum, v) => sum + ((v ?? 10) - 10), 0);
}
