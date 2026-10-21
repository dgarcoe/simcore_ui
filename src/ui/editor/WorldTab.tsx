import { useState } from 'react';
import { COMPARE_OPS, itemsUsed, type Compare, type CompareOp, type NeedConfig, type RuleConfig, type RuleWhen } from '../../api/scenario';
import { ChipPicker } from './ChipPicker';
import { useDraft } from './draft';
import { EffectsEditor } from './EffectsEditor';
import { prune, RequirementEditor, StatSliders } from './RulesWidgets';

const BASIC_ACTIONS = ['rest', 'work', 'observe', 'speak', 'interact'];

/** Needs (hunger, sleep…) and world rules (when X → consequences or end of the run). */
export function WorldTab() {
  const [draft, update] = useDraft();
  const [name, setName] = useState('');
  const needs = draft.needs ?? {};
  const places = draft.environment.locations.map((l) => l.name).filter(Boolean);
  const agents = draft.agents.map((a) => a.name).filter(Boolean);
  const conditions = Object.keys(draft.conditions ?? {});
  const items = [...new Set([...Object.keys(draft.items ?? {}), ...itemsUsed(draft)])].sort();
  const actions = [...BASIC_ACTIONS, ...Object.keys(draft.actions ?? {})];
  const setNeed = (key: string, fn: (n: NeedConfig) => void) =>
    update((d) => {
      const n = ((d.needs ??= {})[key] ??= {});
      fn(n);
      d.needs[key] = prune(n);
    });
  const setRule = (i: number, fn: (r: RuleConfig) => void) =>
    update((d) => {
      fn(d.rules![i]);
      d.rules![i] = prune(d.rules![i]);
    });

  return (
    <div className="ed-section">
      <h3>Necesidades ({Object.keys(needs).length})</h3>
      <p className="dim small">Crecen solas cada tick y empujan a los agentes a actuar: hambre, sueño, miedo… Al llegar al máximo hacen daño.</p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim();
          if (n) update((d) => void ((d.needs ??= {})[n] ??= { label: n, grows: 0.04, relief: 0.5 }));
          setName('');
        }}
      >
        <input className="input grow" placeholder="Nombre (hunger, sleep…)" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn" type="submit">+ Necesidad</button>
      </form>
      {Object.entries(needs).map(([key, n]) => (
        <article key={key} className="ed-card">
          <div className="row">
            <strong>{key}</strong>
            <input className="input grow" placeholder="Nombre que leen los agentes (hambre)" value={n.label ?? ''} onChange={(e) => setNeed(key, (x) => void (x.label = e.target.value))} />
            <button
              className="btn"
              title="Eliminar necesidad"
              onClick={() =>
                update((d) => {
                  delete d.needs![key];
                  if (!Object.keys(d.needs!).length) delete d.needs;
                })
              }
            >
              ✕
            </button>
          </div>
          <div className="ed-grid">
            <label>
              Crece por tick: {(n.grows ?? 0.03).toFixed(2)}
              <input type="range" min={0} max={0.3} step={0.01} value={n.grows ?? 0.03} onChange={(e) => setNeed(key, (x) => void (x.grows = Number(e.target.value)))} />
            </label>
            <label>
              Al satisfacerla baja: {(n.relief ?? 0.5).toFixed(2)}
              <input type="range" min={0.05} max={1} step={0.05} value={n.relief ?? 0.5} onChange={(e) => setNeed(key, (x) => void (x.relief = Number(e.target.value)))} />
            </label>
          </div>
          <div className="fx-row">
            <span className="fx-label">Se satisface con</span>
            <div className="fx-items">
              <span className="row wrap"><span className="trait-label">Usar</span><ChipPicker options={items} value={n.satisfied_by?.items} onChange={(v) => setNeed(key, (x) => void (x.satisfied_by = prune({ ...x.satisfied_by, items: v })))} /></span>
              <span className="row wrap"><span className="trait-label">Hacer</span><ChipPicker options={actions} value={n.satisfied_by?.actions} onChange={(v) => setNeed(key, (x) => void (x.satisfied_by = prune({ ...x.satisfied_by, actions: v })))} /></span>
              <span className="row wrap"><span className="trait-label">En</span><ChipPicker options={places} value={n.satisfied_by?.places} onChange={(v) => setNeed(key, (x) => void (x.satisfied_by = prune({ ...x.satisfied_by, places: v })))} /></span>
              <span className="dim small">Solo «En»: descansar o trabajar allí. «Hacer» + «En»: esa acción en esos lugares.</span>
            </div>
          </div>
          <div className="fx-row">
            <span className="fx-label">Al máximo, cada tick</span>
            <StatSliders value={n.at_max} onChange={(v) => setNeed(key, (x) => void (x.at_max = v))} />
          </div>
          <details>
            <summary className="small">Quién la tiene (por defecto, todos)</summary>
            <RequirementEditor conditions={conditions} value={n.who} withItems={false} onChange={(r) => setNeed(key, (x) => void (x.who = r))} />
          </details>
        </article>
      ))}

      <div className="row between">
        <h3>Reglas ({draft.rules?.length ?? 0})</h3>
        <button className="btn" onClick={() => update((d) => void (d.rules ??= []).push({ description: '', when: { every: 6 }, then: {} }))}>+ Regla</button>
      </div>
      <p className="dim small">Cuando se cumple todo lo de «Cuando», pasan las consecuencias. Una regla puede terminar la simulación (condición de fin).</p>
      {(draft.rules ?? []).map((r, i) => (
        <article key={i} className="ed-card">
          <div className="row">
            <input className="input grow" placeholder="Qué pasa (los agentes lo perciben; vacío: en silencio)" value={r.description ?? ''} onChange={(e) => setRule(i, (x) => void (x.description = e.target.value))} />
            <label className="toggle">
              <input type="checkbox" checked={!!r.once} onChange={(e) => setRule(i, (x) => void (x.once = e.target.checked))} /> Solo una vez
            </label>
            <button className="btn" title="Eliminar regla" onClick={() => update((d) => void d.rules!.splice(i, 1))}>✕</button>
          </div>
          <WhenEditor value={r.when ?? {}} places={places} conditions={conditions} items={Object.keys(draft.items ?? {})} onChange={(w) => setRule(i, (x) => void (x.when = w))} />
          <EffectsEditor
            effects={r.then}
            agents={agents}
            places={places}
            items={items}
            conditions={conditions}
            needs={Object.keys(needs)}
            allowEnd
            onChange={(fx) => setRule(i, (x) => void (x.then = fx ?? {}))}
          />
        </article>
      ))}
    </div>
  );
}

function CompareInput({ value, onChange }: { value: Compare | undefined; onChange: (c: Compare | undefined) => void }) {
  const [op, v] = (Object.entries(value ?? {})[0] ?? ['gte', '']) as [CompareOp, number | string | boolean | ''];
  const parse = (s: string): number | string | boolean => (s === 'true' ? true : s === 'false' ? false : s !== '' && !Number.isNaN(Number(s)) ? Number(s) : s);
  return (
    <span className="row">
      <select className="select" value={op} onChange={(e) => onChange(v === '' ? undefined : { [e.target.value]: v })}>
        {COMPARE_OPS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
      </select>
      <input className="input tiny" placeholder="valor" value={String(v)} onChange={(e) => onChange(e.target.value === '' ? undefined : { [op]: parse(e.target.value) })} />
    </span>
  );
}

/** Builder for a rule's `when`. */
function WhenEditor({ value, onChange, places, conditions, items }: { value: RuleWhen; onChange: (w: RuleWhen) => void; places: string[]; conditions: string[]; items: string[] }) {
  const set = (patch: Partial<RuleWhen>) => onChange(prune({ ...value, ...patch }));
  const num = (s: string) => (s === '' ? undefined : Math.max(0, Number(s)));
  const globals = Object.entries(value.global ?? {});
  const placeRows = Object.entries(value.place ?? {});
  return (
    <details open className="when">
      <summary>Cuando</summary>
      <div className="ed-grid">
        <label>En el tick<input className="input" type="number" min={0} value={value.at ?? ''} onChange={(e) => set({ at: num(e.target.value) })} /></label>
        <label>Cada N ticks<input className="input" type="number" min={1} value={value.every ?? ''} onChange={(e) => set({ every: num(e.target.value) || undefined })} /></label>
        <label>Desde el tick<input className="input" type="number" min={0} value={value.from ?? ''} onChange={(e) => set({ from: num(e.target.value) })} /></label>
        <label>Hasta el tick<input className="input" type="number" min={0} value={value.until ?? ''} onChange={(e) => set({ until: num(e.target.value) })} /></label>
      </div>
      <div className="fx-row">
        <span className="fx-label">Variables del mundo</span>
        <div className="fx-items">
          {globals.map(([k, c], i) => (
            <span key={i} className="row">
              <input
                className="input"
                defaultValue={k}
                onBlur={(e) => {
                  const g = Object.fromEntries(globals.map(([kk, cc]) => [kk === k ? e.target.value.trim() || k : kk, cc]));
                  set({ global: g });
                }}
              />
              <CompareInput value={c} onChange={(cmp) => set({ global: prune({ ...value.global, [k]: cmp }) as RuleWhen['global'] })} />
              <button className="btn" onClick={() => set({ global: prune(Object.fromEntries(globals.filter(([kk]) => kk !== k))) })}>✕</button>
            </span>
          ))}
          <button className="btn" onClick={() => set({ global: { ...value.global, [`variable${globals.length + 1}`]: { lt: 0.3 } } })}>+ Variable</button>
        </div>
      </div>
      <div className="fx-row">
        <span className="fx-label">Agentes vivos</span>
        <CompareInput value={value.alive} onChange={(c) => set({ alive: c })} />
      </div>
      <div className="fx-row">
        <span className="fx-label">Cuántos agentes</span>
        <span className="row wrap">
          <select className="select" value={value.count?.condition ?? ''} onChange={(e) => set({ count: prune({ ...value.count, condition: e.target.value }) })}>
            <option value="">(con cualquier estado)</option>
            {conditions.map((c) => <option key={c} value={c}>con {c}</option>)}
          </select>
          <select className="select" value={value.count?.location ?? ''} onChange={(e) => set({ count: prune({ ...value.count, location: e.target.value }) })}>
            <option value="">(en cualquier sitio)</option>
            {places.map((p) => <option key={p} value={p}>en {p}</option>)}
          </select>
          <select className="select" value={value.count?.item ?? ''} onChange={(e) => set({ count: prune({ ...value.count, item: e.target.value }) })}>
            <option value="">(lleven lo que lleven)</option>
            {items.map((it) => <option key={it} value={it}>con {it}</option>)}
          </select>
          <CompareInput
            value={Object.fromEntries(Object.entries(value.count ?? {}).filter(([k]) => COMPARE_OPS.some(([op]) => op === k)))}
            onChange={(c) => {
              const base = Object.fromEntries(Object.entries(value.count ?? {}).filter(([k]) => !COMPARE_OPS.some(([op]) => op === k)));
              set({ count: c ? prune({ ...base, ...c }) : undefined });
            }}
          />
        </span>
      </div>
      <div className="fx-row" title="Cierto mientras el mismo agente vivo lleva el objeto N ticks seguidos. En la descripción y las consecuencias, {holder} se cambia por su nombre (p. ej. un final «{holder} es el nuevo señor»).">
        <span className="fx-label">Alguien lleva</span>
        <span className="row wrap">
          <select className="select" value={value.holds?.item ?? ''} onChange={(e) => set({ holds: e.target.value ? { ...value.holds, item: e.target.value } : undefined })}>
            <option value="">(nadie en concreto)</option>
            {items.map((it) => <option key={it} value={it}>{it}</option>)}
          </select>
          {value.holds && (
            <>
              <label className="row">
                durante
                <input className="input" type="number" min={1} value={value.holds.ticks ?? 1} onChange={(e) => set({ holds: { ...value.holds!, ticks: Math.max(1, Number(e.target.value) || 1) } })} />
                ticks seguidos
              </label>
              <select className="select" value={value.holds.location ?? ''} onChange={(e) => set({ holds: prune({ ...value.holds!, location: e.target.value }) as RuleWhen['holds'] })}>
                <option value="">(esté donde esté)</option>
                {places.map((p) => <option key={p} value={p}>en {p}</option>)}
              </select>
              <span className="dim small">Usa {'{holder}'} en los textos para nombrarlo.</span>
            </>
          )}
        </span>
      </div>
      <div className="fx-row">
        <span className="fx-label">Estado de lugares</span>
        <div className="fx-items">
          {placeRows.map(([p, spec], i) => (
            <span key={i} className="row wrap">
              <select
                className="select"
                value={p}
                onChange={(e) => set({ place: Object.fromEntries(placeRows.map(([pp, ss]) => [pp === p ? e.target.value : pp, ss])) })}
              >
                {places.map((pl) => <option key={pl}>{pl}</option>)}
              </select>
              <select
                className="select"
                value={spec.closed === undefined ? '' : String(spec.closed)}
                onChange={(e) => set({ place: { ...value.place, [p]: prune({ ...spec, closed: e.target.value === '' ? undefined : e.target.value === 'true' }) } })}
              >
                <option value="">(abierto o cerrado)</option>
                <option value="true">está cerrado</option>
                <option value="false">está abierto</option>
              </select>
              <select
                className="select"
                value={spec.hazard === undefined ? '' : String(spec.hazard)}
                onChange={(e) => set({ place: { ...value.place, [p]: prune({ ...spec, hazard: e.target.value === '' ? undefined : e.target.value === 'true' }) } })}
              >
                <option value="">(con o sin peligro)</option>
                <option value="true">es peligroso</option>
                <option value="false">es seguro</option>
              </select>
              <span className="dim small">gente:</span>
              <CompareInput value={spec.occupants} onChange={(c) => set({ place: { ...value.place, [p]: prune({ ...spec, occupants: c }) } })} />
              <button className="btn" onClick={() => set({ place: prune(Object.fromEntries(placeRows.filter(([pp]) => pp !== p))) })}>✕</button>
            </span>
          ))}
          {places.some((p) => !(p in (value.place ?? {}))) && (
            <button className="btn" onClick={() => set({ place: { ...value.place, [places.find((p) => !(p in (value.place ?? {})))!]: { closed: true } } })}>+ Lugar</button>
          )}
        </div>
      </div>
    </details>
  );
}
