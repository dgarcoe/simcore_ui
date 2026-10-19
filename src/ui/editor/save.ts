import type { ScenarioConfig } from '../../api/scenario';
import type { ScenarioRecord } from '../../api/types';

export interface SaveApi {
  saveScenario(data: unknown, id?: string | null): Promise<ScenarioRecord>;
}

export interface SaveResult {
  rec: ScenarioRecord;
  name: string;
  /** updated: overwrote the scenario; created: a new one; fallback: an old Simcore refused
   *  to modify a built-in scenario, so it was saved as the user's own. */
  kind: 'updated' | 'created' | 'fallback';
}

// What Simcore versions before in-place editing answer for a built-in scenario.
const BUILTIN_REFUSED = /is builtin/i;

/** Save the draft: overwrite the scenario being edited, or create a new one (asCopy / unsaved). */
export async function saveDraft(
  api: SaveApi,
  payload: ScenarioConfig,
  editing: { id: string | null; builtin: boolean },
  asCopy = false,
): Promise<SaveResult> {
  const data = structuredClone(payload);
  if (asCopy && !/\(copia\)$/.test(data.simulation.name)) data.simulation.name += ' (copia)';
  const id = asCopy ? null : editing.id;
  if (!id) return { rec: await api.saveScenario(data, null), name: data.simulation.name, kind: 'created' };
  try {
    return { rec: await api.saveScenario(data, id), name: data.simulation.name, kind: 'updated' };
  } catch (e) {
    if (!editing.builtin || !BUILTIN_REFUSED.test((e as Error).message)) throw e;
    return { rec: await api.saveScenario(data, null), name: data.simulation.name, kind: 'fallback' };
  }
}
