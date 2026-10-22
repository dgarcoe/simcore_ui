// Data sources feeding the store: a live Simcore server or a recorded replay.

import * as api from '../api/client';
import { requiredFeatures, type ScenarioConfig } from '../api/scenario';
import { connectSocket } from '../api/socket';
import type { SimEvent, SimState } from '../api/types';
import { bus } from './bus';
import { useSim } from './simStore';
import { scoreEvent, type Moment } from './story';

let stopCurrent: (() => void) | null = null;
let replay: Replay | null = null;

function stop(): void {
  stopCurrent?.();
  stopCurrent = null;
  replay = null;
  useSim.getState().set({ replayTimeline: null });
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
      if (e.type === 'tick_end') runHasTick = true;
      useSim.getState().ingest(e);
      if (e.type === 'simulation_start') {
        runHasTick = false;
        // The first tick_end only comes once every agent has asked the LLM (slow on a Jetson):
        // Simcore already knows places and starting positions, so draw the map now.
        void seedNewRun();
        // Someone may start another scenario; fetch its config for agent looks and map hints.
        void refreshScenarioDescription();
      }
    },
    onStatus: (connected) => useSim.getState().set({ connected }),
  });
  void refreshScenarioDescription();
}

/** Whether the current live run already delivered a tick_end (then its state is newer than /api/state at start). */
let runHasTick = false;

/** Draws a run that just started from Simcore's initial state, unless its first tick already arrived. */
export async function seedNewRun(fetchState = api.fetchState): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const state = await fetchState().catch(() => null);
    if (runHasTick || useSim.getState().mode !== 'live') return false;
    if (state) {
      // Not silent: the map scene must place the new run's agents (same map, new run).
      useSim.getState().ingest({ type: 'tick_end', tick: state.clock.tick, data: state as any, source: '' });
      return true;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
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

/** The running Simcore is older than what a scenario needs. */
export function outdatedMessage(missing: string[]): string {
  return (
    `Tu Simcore es anterior a lo que usa este escenario (${missing.join('; ')}) y lo ejecutaría mal. ` +
    'Actualízalo volviendo a lanzar ./scripts/simcore-up.sh (si fijaste SIMCORE_REF en .env, borra esa línea).'
  );
}

export async function runScenario(id: string, demo: boolean, speed: number): Promise<void> {
  const scenarios = await api.listScenarios().catch(() => []);
  const match = scenarios.find((s) => s.id === id);
  // An older Simcore would silently ignore what it doesn't know (and e.g. end the run at once).
  const needs = match ? requiredFeatures(match.data as ScenarioConfig) : [];
  if (needs.length) {
    const have = (await api.fetchVersion())?.features ?? [];
    const missing = needs.filter((n) => !have.includes(n.feature));
    if (missing.length) throw new Error(outdatedMessage(missing.map((m) => m.label)));
  }
  if (useSim.getState().mode !== 'live') await startLive();
  // Until the new run's simulation_start / first state arrives, the old run's clock must not show.
  useSim.getState().set({ simFresh: false });
  if (match) useSim.getState().setScenarioConfig(match.data as ScenarioConfig);
  try {
    await api.runScenario(id, { demo, speed });
  } catch (err) {
    useSim.getState().set({ simFresh: true });
    throw err;
  }
}

export interface ReplayFile {
  scenario?: { name?: string; description?: string };
  /** The scenario YAML, so replays get professions and map hints too. */
  config?: ScenarioConfig;
  events: SimEvent[];
  /** Runs recorded by Simcore: how it went (model, ending, survivors…). */
  meta?: api.RunMeta;
}

export async function startReplay(url: string): Promise<void> {
  playReplay((await (await fetch(url)).json()) as ReplayFile);
}

/** Watch a run Simcore recorded. */
export async function startRun(id: string): Promise<void> {
  playReplay((await api.fetchRun(id)) as unknown as ReplayFile);
}

export function playReplay(file: ReplayFile): void {
  stop();
  const store = useSim.getState();
  store.reset();
  store.set({
    mode: 'replay',
    connected: true,
    scenarioDescription: file.scenario?.description ?? '',
    replayTimeline: timelineOf(file.events),
  });
  store.setScenarioConfig(file.config ?? null);
  replay = new Replay(file.events, file.config ?? null);
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

/** Back to the first tick and play. */
export function restartReplay(): void {
  if (!replay) return;
  replay.seek(0);
  replay.resume();
  useSim.getState().set({ paused: false });
}

/** Jump to the end of a tick of the replay (instantly, without animations). */
export function seekReplay(tick: number): void {
  replay?.seek(tick);
}

export function stepReplay(delta: number): void {
  if (!replay) return;
  replay.seek(Math.max(0, replay.at + delta));
}

/** Jump to the next (or previous) key moment. */
export function jumpMoment(direction: 1 | -1): void {
  const timeline = useSim.getState().replayTimeline;
  if (!replay || !timeline) return;
  const ticks = [...new Set(timeline.moments.map((m) => m.tick))].sort((x, y) => x - y);
  const at = replay.at;
  const target = direction > 0 ? ticks.find((t) => t > at) : [...ticks].reverse().find((t) => t < at);
  if (target !== undefined) replay.seek(target);
}

export interface Timeline {
  /** Last tick of the run. */
  ticks: number;
  /** Key moments of the whole run (importance ≥ 0.5). */
  moments: Moment[];
  /** Clock text at each tick ("Day 2, 14:00"). */
  times: Record<number, string>;
}

export function timelineOf(events: SimEvent[]): Timeline {
  const times: Record<number, string> = {};
  let ticks = 0;
  const moments: Moment[] = [];
  for (const e of events) {
    ticks = Math.max(ticks, e.tick);
    if (e.type === 'tick_end') {
      const time = (e.data as Partial<SimState>).clock?.time;
      if (time) times[e.tick] = time;
    }
    const m = scoreEvent(e);
    if (m && m.importance >= 0.5) moments.push(m);
  }
  return { ticks, moments, times };
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

/** Plays recorded events tick by tick, like the server would, and can jump to any tick. */
class Replay {
  private i = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private paused = false;
  /** Last tick fully shown. */
  at = 0;

  constructor(
    readonly events: SimEvent[],
    private readonly config: ScenarioConfig | null,
  ) {}

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

  /** Show the world at the end of `tick`: replays the events silently and redraws the map at once. */
  seek(tick: number): void {
    const wasPaused = this.paused;
    this.pause();
    const store = useSim.getState();
    if (tick <= this.at || this.i === 0) {
      const { selectedAgent, follow } = store;
      store.reset();
      store.setScenarioConfig(this.config);
      store.set({ selectedAgent, follow });
      this.i = 0;
      this.at = 0;
    }
    const batch: SimEvent[] = [];
    while (this.i < this.events.length) {
      const e = this.events[this.i++];
      batch.push(e);
      if (e.type === 'tick_end') {
        this.at = e.tick;
        if (e.tick >= tick) break;
      }
    }
    // After the last tick only the ending is left: show it too.
    if (!this.events.slice(this.i).some((e) => e.type === 'tick_end')) {
      batch.push(...this.events.slice(this.i));
      this.i = this.events.length;
    }
    useSim.getState().ingestMany(batch);
    useSim.getState().set({ banner: null });
    bus.emit('resync');
    if (!wasPaused) {
      this.paused = false;
      if (this.i < this.events.length) this.timer = setTimeout(() => this.step(), useSim.getState().tickMs);
    }
  }

  private step(): void {
    if (this.paused) return;
    const { ingest } = useSim.getState();
    while (this.i < this.events.length) {
      const e = this.events[this.i++];
      ingest(e);
      if (e.type === 'tick_end') {
        this.at = e.tick;
        break;
      }
    }
    if (this.i < this.events.length) this.timer = setTimeout(() => this.step(), useSim.getState().tickMs);
  }
}
