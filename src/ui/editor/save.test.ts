import { describe, expect, it, vi } from 'vitest';
import { emptyScenario } from '../../api/scenario';
import type { ScenarioRecord } from '../../api/types';
import { saveDraft } from './save';

const rec = (id: string, builtin = false) => ({ id, builtin, meta: {}, data: {} }) as unknown as ScenarioRecord;
const draft = () => {
  const d = emptyScenario();
  d.simulation.name = 'Pueblo';
  return d;
};

describe('saveDraft', () => {
  it('overwrites the scenario being edited, built-in ones too', async () => {
    const api = { saveScenario: vi.fn(async (_d: unknown, id?: string | null) => rec(id!, true)) };
    const r = await saveDraft(api, draft(), { id: 'builtin:town', builtin: true });
    expect(r.kind).toBe('updated');
    expect(api.saveScenario).toHaveBeenCalledWith(expect.anything(), 'builtin:town');
  });

  it('saves a copy when asked, renaming it', async () => {
    const api = { saveScenario: vi.fn(async () => rec('user:1')) };
    const r = await saveDraft(api, draft(), { id: 'user:0', builtin: false }, true);
    expect(r).toMatchObject({ kind: 'created', name: 'Pueblo (copia)' });
    expect(api.saveScenario).toHaveBeenCalledWith(expect.anything(), null);
  });

  it('falls back to a new scenario when an old Simcore refuses to modify a built-in one', async () => {
    const api = {
      saveScenario: vi.fn(async (_d: unknown, id?: string | null) => {
        if (id) throw new Error('Scenario not found or is builtin');
        return rec('user:9');
      }),
    };
    const r = await saveDraft(api, draft(), { id: 'builtin:town', builtin: true });
    expect(r).toMatchObject({ kind: 'fallback', name: 'Pueblo' });
    expect(r.rec.id).toBe('user:9');
  });

  it('does not hide other errors', async () => {
    const api = { saveScenario: vi.fn(async () => { throw new Error('Scenario not found or is builtin'); }) };
    await expect(saveDraft(api, draft(), { id: 'user:gone', builtin: false })).rejects.toThrow('not found');
  });
});
