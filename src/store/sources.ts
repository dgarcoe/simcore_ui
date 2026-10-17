// Data sources feeding the store: a live Simcore server or a recorded replay.

import * as api from '../api/client';
import type { ScenarioConfig } from '../api/scenario';
import { connectSocket } from '../api/socket';
import type { SimEvent, SimState } from '../api/types';
import { useSim } from './simStore';

let stopCurrent: (() => void) | null = null;
let replay: Replay | null = null;

function stop(): void {
  stopCurrent?.();
  stopCurrent = null;
  replay = null;
}

/** Stops the current source and goes back to the start screen. */
export function leave(): void {
  stop();
  useSim.getState().reset();
  useSim.getState().set({ mode: 'none', connected: false });
}

export async function startLive(): Promise<void> {
  stop();
  const store = useSim.getState();
  store.reset();
  store.set({ mode: 'live', connected: false });
  try {
    // Catch up with what already happened so joining mid-run shows history.
    const history = await api.fetchEvents(500);
    for (const e of history) if (e.type !== 'tick_end') useSim.getState().ingest(e, true);
    const state = await api.fetchState();
    if (state) ingestState(state);
  } catch {
    /* server not up yet; the socket keeps retrying */
  }
  stopCurrent = connectSocket({
    onEvent: (e) => {
      useSim.getState().ingest(e);
      // Someone may start another scenario; fetch its config for agent looks and map hints.
      if (e.type === 'simulation_start') void refreshScenarioDescription();
    },
    onStatus: (connected) => useSim.getState().set({ connected }),
  });
  void refreshScenarioDescription();
}

/** Seeds the store from /api/state so the map shows up before the next tick. */
function ingestState(state: SimState): void {
  useSim.getState().ingest({ type: 'tick_end', tick: state.clock.tick, data: state as any, source: '' }, true);
}

async function refreshScenarioDescription(): Promise<void> {
  try {
    const name = useSim.getState().scenarioName;
    if (!name || useSim.getState().scenarioConfig?.simulation.name === name) return;
    const scenarios = await api.listScenarios();
    const match = scenarios.find((s) => s.meta.name === name);
    if (match) useSim.getState().setScenarioConfig(match.data as ScenarioConfig);
  } catch {
    /* optional */
  }
}

export async function runScenario(id: string, demo: boolean, speed: number): Promise<void> {
  if (useSim.getState().mode !== 'live') await startLive();
  const scenarios = await api.listScenarios().catch(() => []);
  const match = scenarios.find((s) => s.id === id);
  if (match) useSim.getState().setScenarioConfig(match.data as ScenarioConfig);
  await api.runScenario(id, { demo, speed });
}

export interface ReplayFile {
  scenario?: { name?: string; description?: string };
  /** The scenario YAML, so replays get professions and map hints too. */
  config?: ScenarioConfig;
  events: SimEvent[];
}

export async function startReplay(url: string): Promise<void> {
  stop();
  const file = (await (await fetch(url)).json()) as ReplayFile;
  const store = useSim.getState();
  store.reset();
  store.set({ mode: 'replay', connected: true, scenarioDescription: file.scenario?.description ?? '' });
  store.setScenarioConfig(file.config ?? null);
  replay = new Replay(file.events);
  stopCurrent = () => replay?.dispose();
  replay.start();
}

export async function control(action: 'pause' | 'resume' | 'stop'): Promise<void> {
  const { mode } = useSim.getState();
  if (mode === 'replay' && replay) {
    if (action === 'pause') replay.pause();
    else if (action === 'resume') replay.resume();
    else replay.dispose();
  } else if (mode === 'live') {
    if (action === 'stop') useSim.getState().set({ stopRequested: true });
    await api.control(action);
  }
  useSim.getState().set({ paused: action === 'pause' });
}

export function restartReplay(): void {
  if (!replay) return;
  const events = replay.events;
  const config = useSim.getState().scenarioConfig;
  replay.dispose();
  useSim.getState().reset();
  useSim.getState().setScenarioConfig(config);
  replay = new Replay(events);
  stopCurrent = () => replay?.dispose();
  replay.start();
}

/**
 * Applies event effects to the running simulation (Simcore versions with an
 * agent life cycle): health, kill, depart, spawn, or world-state keys.
 */
export async function applyEffects(description: string, effects: Record<string, unknown>): Promise<void> {
  if (useSim.getState().mode !== 'live') return;
  await api.injectEvent(description, '', effects);
}

export async function inject(description: string, location: string): Promise<void> {
  const { mode, sim, ingest } = useSim.getState();
  if (mode === 'live') return api.injectEvent(description, location);
  // Replays have no engine: show the event locally so the effect can be previewed.
  ingest({ type: 'injected_event', tick: sim?.clock.tick ?? 0, data: { description, location }, source: '' });
}

/** Plays recorded events tick by tick, like the server would. */
class Replay {
  private i = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private paused = false;

  constructor(readonly events: SimEvent[]) {}

  start(): void {
    this.step();
  }

  pause(): void {
    this.paused = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.step();
  }

  dispose(): void {
    this.pause();
    this.i = this.events.length;
  }

  private step(): void {
    if (this.paused) return;
    const { ingest } = useSim.getState();
    while (this.i < this.events.length) {
      const e = this.events[this.i++];
      ingest(e);
      if (e.type === 'tick_end') break;
    }
    if (this.i < this.events.length) this.timer = setTimeout(() => this.step(), useSim.getState().tickMs);
  }
}
