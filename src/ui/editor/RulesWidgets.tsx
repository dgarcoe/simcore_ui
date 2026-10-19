import { STATS, type Outcome, type Requirement, type Stat } from '../../api/scenario';
import { AmountsField } from './AmountsField';
import { ChipPicker } from './ChipPicker';

export function StatSliders({ value, onChange }: { value: Partial<Record<Stat, number>> | undefined; onChange: (v: Partial<Record<Stat, number>>) => void }) {
  return (
    <div className="fx-items">
      {STATS.map(([k, label]) => {
        const v = value?.[k] ?? 0;
        return (
          <span key={k} className="row">
            <span className="trait-label">{label}</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={v}
              onChange={(e) => {
                const next = { ...(value ?? {}) };
                const n = Number(e.target.value);
                if (n) next[k] = n;
                else delete next[k];
                onChange(next);
              }}
            />
            <span className={v < 0 ? 'bad-text' : v > 0 ? 'ok-text' : 'dim'}>{v > 0 ? '+' : ''}{v.toFixed(2)}</span>
          </span>
        );
      })}
    </div>
  );
}

/** Who can do it / who it can be done to. */
export function RequirementEditor({ value, onChange, conditions, withItems = true }: { value: Requirement | undefined; onChange: (r: Requirement) => void; conditions: string[]; withItems?: boolean }) {
  const r = value ?? {};
  const set = (patch: Partial<Requirement>) => onChange(prune({ ...r, ...patch }));
  return (
    <div className="fx-items">
      <span className="row wrap"><span className="trait-label">Con estado</span><ChipPicker options={conditions} value={r.conditions} onChange={(v) => set({ conditions: v })} /></span>
      <span className="row wrap" title="Basta con tener uno de ellos"><span className="trait-label">Con alguno de</span><ChipPicker options={conditions} value={r.any_conditions} onChange={(v) => set({ any_conditions: v })} /></span>
      <span className="row wrap"><span className="trait-label">Sin estado</span><ChipPicker options={conditions} value={r.not_conditions} onChange={(v) => set({ not_conditions: v })} /></span>
      <label className="row">
        <span className="trait-label">Profesión</span>
        <input
          className="input"
          placeholder="médic, enfermer (cualquiera; vale parte de la palabra)"
          defaultValue={(r.professions ?? []).join(', ')}
          onBlur={(e) => set({ professions: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
        />
      </label>
      {withItems && <AmountsField label="Lleva al menos" value={r.items} placeholder="shotgun: 1" onChange={(items) => set({ items })} />}
    </div>
  );
}

/** What happens to someone: stats, conditions, items, death. */
export function OutcomeEditor({ value, onChange, conditions }: { value: Outcome | undefined; onChange: (o: Outcome) => void; conditions: string[] }) {
  const o = value ?? {};
  const set = (patch: Partial<Outcome>) => onChange(prune({ ...o, ...patch }));
  return (
    <div className="fx-items">
      <StatSliders value={o} onChange={(v) => onChange(prune({ ...o, health: undefined, energy: undefined, mood: undefined, ...v }))} />
      <span className="row wrap"><span className="trait-label">Añade estado</span><ChipPicker options={conditions} value={o.add_conditions} onChange={(v) => set({ add_conditions: v })} /></span>
      <span className="row wrap"><span className="trait-label">Quita estado</span><ChipPicker options={conditions} value={o.remove_conditions} onChange={(v) => set({ remove_conditions: v })} /></span>
      <AmountsField label="Objetos (+ recibe, − pierde)" value={o.items} placeholder="food: 1" onChange={(items) => set({ items })} />
      <label className="toggle">
        <input type="checkbox" checked={!!o.kill} onChange={(e) => set({ kill: e.target.checked })} /> Muere
      </label>
    </div>
  );
}

/** Drops empty values so the YAML stays small. */
export function prune<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === '' || v === false || v === 0) continue;
    if (Array.isArray(v) && !v.length) continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) continue;
    out[k] = v;
  }
  return out as T;
}
