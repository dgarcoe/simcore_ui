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

export async function injectEvent(description: string, location = ''): Promise<void> {
  await post('/api/inject', { description, location });
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

export async function postmortem(): Promise<string> {
  const res = await json<{ narrative?: string; error?: string }>(await post('/api/postmortem/narrative'));
  if (res.error) throw new Error(res.error);
  return res.narrative ?? '';
}

export async function saveScenario(data: unknown, id?: string | null): Promise<ScenarioRecord> {
  const res = id
    ? await fetch(`/api/scenarios/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    : await post('/api/scenarios', data);
  const rec = await json<ScenarioRecord & { error?: string }>(res);
  if (rec.error) throw new Error(rec.error);
  return rec;
}

export async function deleteScenario(id: string): Promise<void> {
  await fetch(`/api/scenarios/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
