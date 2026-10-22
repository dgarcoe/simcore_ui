import type { ScenarioRecord, SimEvent, SimState } from './types';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

function post(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Returns null when the server has no simulation loaded. */
export async function fetchState(): Promise<SimState | null> {
  const data = await json<SimState | { error: string }>(await fetch('/api/state'));
  return 'error' in data ? null : data;
}

export async function fetchEvents(lastN = 200): Promise<SimEvent[]> {
  const data = await json<SimEvent[] | { error: string }>(await fetch(`/api/events?last_n=${lastN}`));
  return Array.isArray(data) ? data : [];
}

export async function control(action: 'pause' | 'resume' | 'stop'): Promise<void> {
  await post(`/api/control/${action}`);
}

export async function injectEvent(description: string, location = '', effects?: Record<string, unknown>): Promise<void> {
  const res = await post('/api/inject', { description, location, ...(effects ? { effects } : {}) });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail ?? `${res.status} ${res.statusText}`);
  }
}

export async function listScenarios(): Promise<ScenarioRecord[]> {
  const data = await json<{ scenarios: ScenarioRecord[] }>(await fetch('/api/scenarios'));
  return data.scenarios ?? [];
}

export async function runScenario(id: string, opts: { demo: boolean; speed: number }): Promise<void> {
  const res = await json<{ status?: string; error?: string }>(
    await post(`/api/scenarios/${encodeURIComponent(id)}/run`, opts),
  );
  if (res.error) throw new Error(res.error);
}

export interface SimcoreVersion {
  ref: string;
  features: string[];
}

/** What the running Simcore supports; null for Simcore versions older than GET /api/version. */
export async function fetchVersion(): Promise<SimcoreVersion | null> {
  try {
    const res = await fetch('/api/version');
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<SimcoreVersion>;
    return Array.isArray(data.features) ? { ref: String(data.ref ?? ''), features: data.features } : null;
  } catch {
    return null;
  }
}

/** A run Simcore recorded (GET /api/runs). */
export interface RunMeta {
  id: string;
  name: string;
  description?: string;
  scenario_id?: string;
  model?: string;
  demo?: boolean;
  started: string;
  ended: string | null;
  status: 'running' | 'finished' | 'interrupted' | 'broken';
  ticks: number;
  events: number;
  end_reason: string;
  end_message: string;
  alive: string[];
}

/** Recorded runs, newest first; null when this Simcore doesn't record them. */
export async function listRuns(): Promise<RunMeta[] | null> {
  const res = await fetch('/api/runs');
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { runs?: RunMeta[] } | null;
  return Array.isArray(data?.runs) ? data.runs : null;
}

/** A recorded run in the replay format: {scenario, config, events, meta}. */
export async function fetchRun(id: string): Promise<{ scenario?: { name?: string; description?: string }; config?: unknown; events: SimEvent[]; meta?: RunMeta }> {
  return json(await fetch(`/api/runs/${encodeURIComponent(id)}`));
}

export async function deleteRun(id: string): Promise<void> {
  const res = await fetch(`/api/runs/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail ?? `${res.status} ${res.statusText}`);
  }
}

export async function postmortem(): Promise<string> {
  const res = await json<{ narrative?: string; error?: string }>(await post('/api/postmortem/narrative'));
  if (res.error) throw new Error(res.error);
  return res.narrative ?? '';
}

/** Simcore could not be reached at all (as opposed to answering with an error). */
export class NetworkError extends Error {}

export async function saveScenario(data: unknown, id?: string | null): Promise<ScenarioRecord> {
  let res: Response;
  try {
    res = id
      ? await fetch(`/api/scenarios/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
      : await post('/api/scenarios', data);
  } catch (e) {
    throw new NetworkError((e as Error).message);
  }
  // With Simcore down, nginx answers 502/504 and the Vite dev proxy an empty 500.
  const down = res.status === 502 || res.status === 503 || res.status === 504 ||
    (res.status === 500 && !(await res.clone().text()).trim());
  if (down) throw new NetworkError(`${res.status} ${res.statusText}`);
  const rec = await json<ScenarioRecord & { error?: string }>(res);
  if (rec.error) throw new Error(rec.error);
  return rec;
}

export async function deleteScenario(id: string): Promise<void> {
  await fetch(`/api/scenarios/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
