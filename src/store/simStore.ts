import { create } from 'zustand';
import type { SimEvent } from '../api/types';
import { bus } from './bus';
import { initialSnapshot, reduce, type SimSnapshot } from './reduce';

export type SourceMode = 'none' | 'live' | 'replay';

export interface UIState extends SimSnapshot {
  mode: SourceMode;
  connected: boolean;
  paused: boolean;
  /** Replay only: milliseconds per tick. */
  tickMs: number;
  scenarioDescription: string;
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
  scenarioDescription: '',
  selectedAgent: null,
  follow: false,
  themeChoice: 'auto',

  ingest: (e, silent = false) => {
    const prev = get();
    const next = reduce(prev, e);
    if (!next) return;
    const patch: Partial<UIState> = next;
    if (next.scenarioName !== prev.scenarioName) patch.themeChoice = loadThemeChoice(next.scenarioName);
    if (e.type === 'simulation_start') patch.paused = false;
    set(patch);
    if (!silent) bus.emit('event', e);
  },

  reset: () => {
    set({ ...initialSnapshot(), selectedAgent: null, follow: false, paused: false });
    bus.emit('reset');
  },

  set: (patch) => set(patch),

  selectAgent: (name) => set({ selectedAgent: name, follow: name ? get().follow : false }),

  setThemeChoice: (id) => {
    try {
      localStorage.setItem(THEME_KEY(get().scenarioName), id);
    } catch {
      /* storage unavailable */
    }
    set({ themeChoice: id });
  },
}));
