import { effectsToForm, formToEffects, targetLabel, type EffectsForm } from '../../api/scenario';

interface Props {
  effects: Record<string, unknown> | undefined;
  onChange: (effects: Record<string, unknown> | undefined) => void;
  agents: string[];
  places: string[];
  /** Known item names (catalog and inventories), suggested in the Objects row. */
  items?: string[];
}

/** What a scheduled event changes: deaths, injuries, departures, arrivals and world variables. */
export function EffectsEditor({ effects, onChange, agents, places, items = [] }: Props) {
  const form = effectsToForm(effects);
  const set = (mutate: (f: EffectsForm) => void) => {
    const next = structuredClone(form);
    mutate(next);
    onChange(formToEffects(next));
  };
  const targets = ['all', ...places.map((p) => `location:${p}`), ...agents];
  // Items go to agents ("all" = everyone alive) or into a place's stock.
  const itemTargets = targets;
  const count =
    form.kill.length + form.depart.length + form.health.length + form.spawn.length + form.items.length + Object.keys(form.world).length;

  return (
    <details className="effects" open={count > 0}>
      <summary>Consecuencias{count ? ` (${count})` : ''}</summary>
      <TargetList label="Mueren" items={form.kill} targets={targets} onChange={(v) => set((f) => void (f.kill = v))} />
      <TargetList label="Se marchan" items={form.depart} targets={targets} onChange={(v) => set((f) => void (f.depart = v))} />

      <div className="fx-row">
        <span className="fx-label">Salud</span>
        <div className="fx-items">
          {form.health.map((h, i) => (
            <span key={i} className="row">
              <select className="select" value={h.target} onChange={(e) => set((f) => void (f.health[i].target = e.target.value))}>
                {targets.map((t) => <option key={t} value={t}>{targetLabel(t)}</option>)}
              </select>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.05}
                value={h.delta}
                onChange={(e) => set((f) => void (f.health[i].delta = Number(e.target.value)))}
              />
              <span className={h.delta < 0 ? 'bad-text' : 'ok-text'}>{h.delta > 0 ? '+' : ''}{Math.round(h.delta * 100)}%</span>
              <button className="btn" onClick={() => set((f) => void f.health.splice(i, 1))}>✕</button>
            </span>
          ))}
          <button className="btn" onClick={() => set((f) => void f.health.push({ target: agents[0] ?? 'all', delta: -0.3 }))}>+ Daño o curación</button>
        </div>
      </div>

      <div className="fx-row">
        <span className="fx-label">Llegan</span>
        <div className="fx-items">
          {form.spawn.map((s, i) => (
            <span key={i} className="row wrap">
              <input className="input" placeholder="Nombre" value={s.name} onChange={(e) => set((f) => void (f.spawn[i].name = e.target.value))} />
              <input className="input" placeholder="Profesión" value={s.profession ?? ''} onChange={(e) => set((f) => void (f.spawn[i].profession = e.target.value))} />
              <select className="select" value={s.starting_location ?? ''} onChange={(e) => set((f) => void (f.spawn[i].starting_location = e.target.value))}>
                <option value="">(primer lugar)</option>
                {places.map((p) => <option key={p}>{p}</option>)}
              </select>
              <label className="row">
                ×
                <input className="input tiny" type="number" min={1} max={50} value={s.count ?? 1} onChange={(e) => set((f) => void (f.spawn[i].count = Math.max(1, Number(e.target.value) || 1)))} />
              </label>
              <button className="btn" onClick={() => set((f) => void f.spawn.splice(i, 1))}>✕</button>
            </span>
          ))}
          <button className="btn" onClick={() => set((f) => void f.spawn.push({ name: 'Recién llegado', profession: '', starting_location: places[0] ?? '', count: 1 }))}>+ Llegada</button>
        </div>
      </div>

      <div className="fx-row">
        <span className="fx-label">Objetos</span>
        <div className="fx-items">
          {form.items.map((r, i) => (
            <span key={i} className="row wrap">
              <select className="select" value={r.target} onChange={(e) => set((f) => void (f.items[i].target = e.target.value))}>
                {itemTargets.map((t) => <option key={t} value={t}>{t.startsWith('location:') ? `En ${t.slice(9)}` : t}</option>)}
              </select>
              <input className="input" list="fx-items" placeholder="objeto" value={r.item} onChange={(e) => set((f) => void (f.items[i].item = e.target.value))} />
              <input className="input tiny" type="number" value={r.delta} title="Negativo para quitar" onChange={(e) => set((f) => void (f.items[i].delta = Number(e.target.value)))} />
              <button className="btn" onClick={() => set((f) => void f.items.splice(i, 1))}>✕</button>
            </span>
          ))}
          <button className="btn" onClick={() => set((f) => void f.items.push({ target: itemTargets[1] ?? 'all', item: items[0] ?? 'food', delta: 5 }))}>
            + Dar o quitar objetos
          </button>
          <datalist id="fx-items">{items.map((k) => <option key={k} value={k} />)}</datalist>
        </div>
      </div>

      <WorldVars world={form.world} onChange={(w) => set((f) => void (f.world = w))} />
      <p className="dim small">Necesita una versión de Simcore con ciclo de vida de agentes; las versiones anteriores solo muestran el suceso.</p>
    </details>
  );
}

function TargetList({ label, items, targets, onChange }: { label: string; items: string[]; targets: string[]; onChange: (v: string[]) => void }) {
  const free = targets.filter((t) => !items.includes(t));
  return (
    <div className="fx-row">
      <span className="fx-label">{label}</span>
      <div className="fx-items row wrap">
        {items.map((t) => (
          <span key={t} className="chip">
            {targetLabel(t)} <button className="link" onClick={() => onChange(items.filter((x) => x !== t))}>✕</button>
          </span>
        ))}
        <select className="select" value="" onChange={(e) => e.target.value && onChange([...items, e.target.value])}>
          <option value="">+ añadir…</option>
          {free.map((t) => <option key={t} value={t}>{targetLabel(t)}</option>)}
        </select>
      </div>
    </div>
  );
}

function WorldVars({ world, onChange }: { world: Record<string, unknown>; onChange: (w: Record<string, unknown>) => void }) {
  const text = Object.entries(world)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n');
  return (
    <label className="fx-row">
      <span className="fx-label">Estado del mundo</span>
      <textarea
        key={text}
        className="input"
        rows={2}
        defaultValue={text}
        placeholder={'school_closed: true\noxygen: 0.4'}
        onBlur={(e) => {
          const out: Record<string, unknown> = {};
          for (const line of e.target.value.split('\n')) {
            const m = line.match(/^\s*([^:]+?)\s*:\s*(.+?)\s*$/);
            if (!m) continue;
            try {
              out[m[1]] = JSON.parse(m[2]);
            } catch {
              out[m[1]] = m[2];
            }
          }
          onChange(out);
        }}
      />
    </label>
  );
}
