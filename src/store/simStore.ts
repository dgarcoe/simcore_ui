import { create } from 'zustand';
import { professions, type ScenarioConfig } from '../api/scenario';
import type { SimEvent } from '../api/types';
import { bus } from './bus';
import { initialSnapshot, reduce, type SimSnapshot } from './reduce';

export type SourceMode = 'none' | 'live' | 'replay' | 'editor';

export interface UIState extends SimSnapshot {
  mode: SourceMode;
  connected: boolean;
  paused: boolean;
  /** Replay only: milliseconds per tick. */
  tickMs: number;
  /** When the current tick started (ms), to show how long the LLM is taking. */
  tickStartedAt: number;
  scenarioDescription: string;
  /** Full config of the running scenario when known (agents' professions, resources…). */
  scenarioConfig: ScenarioConfig | null;
  professions: Record<string, string>;
  /** Scenario open in the editor: its id (null = new) and draft. */
  editing: { id: string | null; builtin: boolean; draft: ScenarioConfig } | null;
  selectedAgent: string | null;
  follow: boolean;
  /** 'auto' or a theme id. */
  themeChoice: string;

  /** silent: update state without animating it (history catch-up). */
  ingest: (e: SimEvent, silent?: boolean) => void;
  reset: () => void;
  set: (patch: Partial<UIState>) => void;
  selectAgent: (name: string | null) => void;
  setThemeChoice: (id: string) => void;
  setScenarioConfig: (cfg: ScenarioConfig | null) => void;
}

const THEME_KEY = (scenario: string) => `simcore-ui:theme:${scenario || '_'}`;

function loadThemeChoice(scenario: string): string {
  try {
    return localStorage.getItem(THEME_KEY(scenario)) ?? 'auto';
  } catch {
    return 'auto';
  }
}

export const useSim = create<UIState>()((set, get) => ({
  ...initialSnapshot(),
  mode: 'none',
  connected: false,
  paused: false,
  tickMs: 1200,
  tickStartedAt: 0,
  scenarioDescription: '',
  scenarioConfig: null,
  professions: {},
  editing: null,
  selectedAgent: null,
  follow: false,
  themeChoice: 'auto',

  ingest: (e, silent = false) => {
    const prev = get();
    const next = reduce(prev, e);
    if (!next) return;
    const patch: Partial<UIState> = next;
    if (next.scenarioName !== prev.scenarioName) patch.themeChoice = loadThemeChoice(next.scenarioName);
    if (e.type === 'tick_start') patch.tickStartedAt = Date.now();
    if (e.type === 'simulation_start') {
      patch.paused = false;
      // Launched from this UI: we already know who takes part in the new run.
      const cfg = prev.scenarioConfig;
      if (cfg && cfg.simulation.name === next.scenarioName) patch.runAgents = cfg.agents.map((a) => a.name);
    }
    set(patch);
    if (!silent) bus.emit('event', e);
  },

  reset: () => {
    set({ ...initialSnapshot(), selectedAgent: null, follow: false, paused: false, scenarioConfig: null, professions: {} });
    bus.emit('reset');
  },

  set: (patch) => set(patch),

  selectAgent: (name) => set({ selectedAgent: name, follow: name ? get().follow : false }),

  setScenarioConfig: (cfg) =>
    set({
      scenarioConfig: cfg,
      professions: professions(cfg),
      scenarioDescription: cfg?.simulation.description ?? get().scenarioDescription,
    }),

  setThemeChoice: (id) => {
    try {
      localStorage.setItem(THEME_KEY(get().scenarioName), id);
    } catch {
      /* storage unavailable */
    }
    set({ themeChoice: id });
  },
}));
