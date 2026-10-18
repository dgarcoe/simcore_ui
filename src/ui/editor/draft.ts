import { useCallback } from 'react';
import { emptyScenario, DEFAULT_PERSONALITY, type ScenarioConfig } from '../../api/scenario';
import type { ScenarioRecord } from '../../api/types';
import { useSim } from '../../store/simStore';

/** Fills in what older or hand-written scenarios may leave out, so the form can bind to it. */
export function normalize(raw: Partial<ScenarioConfig> | Record<string, any>): ScenarioConfig {
  const base = emptyScenario();
  const cfg = structuredClone(raw) as ScenarioConfig;
  return {
    simulation: { ...base.simulation, ...cfg.simulation },
    llm: { ...base.llm, ...cfg.llm },
    environment: {
      ...base.environment,
      ...cfg.environment,
      global_state: { ...(cfg.environment?.global_state ?? {}) },
      locations: (cfg.environment?.locations ?? []).map((l) => ({
        type: 'generic',
        capacity: 20,
        position: [0, 0] as [number, number],
        ...l,
        properties: { ...(l.properties ?? {}) },
      })),
    },
    agents: (cfg.agents ?? []).map((a) => ({
      age: 30,
      profession: '',
      goals: [],
      starting_location: '',
      resources: {},
      backstory: '',
      ...a,
      personality: { ...DEFAULT_PERSONALITY, ...(a.personality ?? {}) },
    })),
    events: { ...cfg.events, scheduled: [...(cfg.events?.scheduled ?? [])] },
    ...(cfg.items && Object.keys(cfg.items).length ? { items: structuredClone(cfg.items) } : {}),
    ...(cfg.conditions && Object.keys(cfg.conditions).length ? { conditions: structuredClone(cfg.conditions) } : {}),
    ...(cfg.actions && Object.keys(cfg.actions).length ? { actions: structuredClone(cfg.actions) } : {}),
    ...(cfg.needs && Object.keys(cfg.needs).length ? { needs: structuredClone(cfg.needs) } : {}),
    ...(cfg.rules?.length ? { rules: structuredClone(cfg.rules) } : {}),
  };
}

export function openEditor(record?: ScenarioRecord): void {
  useSim.getState().set({
    mode: 'editor',
    editing: record
      ? { id: record.id, builtin: record.builtin, draft: normalize(record.data) }
      : { id: null, builtin: false, draft: emptyScenario() },
  });
}

/** The draft being edited plus an immutable updater (mutate a clone). */
export function useDraft(): [ScenarioConfig, (mutate: (d: ScenarioConfig) => void) => void] {
  const draft = useSim((s) => s.editing!.draft);
  const update = useCallback((mutate: (d: ScenarioConfig) => void) => {
    const editing = useSim.getState().editing;
    if (!editing) return;
    const next = structuredClone(editing.draft);
    mutate(next);
    useSim.getState().set({ editing: { ...editing, draft: next } });
  }, []);
  return [draft, update];
}
