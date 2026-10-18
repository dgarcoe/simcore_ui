import { describe, expect, it } from 'vitest';
import type { SimState } from '../api/types';
import { useSim } from './simStore';
import { seedNewRun } from './sources';

const state = (tick: number): SimState =>
  ({
    clock: { tick, max_ticks: 48, time: '', progress: 0, elapsed_hours: 0 },
    agents: { ana: { id: 'ana', name: 'Ana', location: 'Plaza', personality: {}, state: { mood: 0, energy: 1, location: 'Plaza' }, relationships: {}, memory_summary: '' } },
    environment: { width: 10, height: 10, locations: { Plaza: { name: 'Plaza', type: 'public', position: [1, 1] } }, global_state: {} },
  }) as unknown as SimState;

describe('seedNewRun', () => {
  it('draws a just-started live run from its initial state', async () => {
    useSim.getState().reset();
    useSim.getState().set({ mode: 'live' });
    useSim.getState().ingest({ type: 'simulation_start', tick: 0, data: { config: 'X' }, source: '' }, true);
    expect(await seedNewRun(async () => state(0))).toBe(true);
    expect(useSim.getState().sim?.agents.ana.location).toBe('Plaza');
  });

  it('does nothing outside live mode and retries when the server is not ready', async () => {
    useSim.getState().reset();
    useSim.getState().set({ mode: 'replay' });
    expect(await seedNewRun(async () => state(0))).toBe(false);
    useSim.getState().set({ mode: 'live' });
    let calls = 0;
    expect(await seedNewRun(async () => (++calls < 2 ? null : state(0)))).toBe(true);
    expect(calls).toBe(2);
  });
});
