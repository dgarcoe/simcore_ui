import { effectsToForm, formToEffects, targetLabel, type EffectsForm } from '../../api/scenario';

interface Props {
  effects: Record<string, unknown> | undefined;
  onChange: (effects: Record<string, unknown> | undefined) => void;
  agents: string[];
  places: string[];
  /** Known item names (catalog and inventories), suggested in the Objects row. */
  items?: string[];
  /** Scenario conditions that events can add or remove. */
  conditions?: string[];
  /** Scenario needs that events can raise or lower. */
  needs?: string[];
  /** Show the "ends the run" row (world rules). */
  allowEnd?: boolean;
}

/** What a scheduled event changes: deaths, injuries, departures, arrivals and world variables. */
export function EffectsEditor({ effects, onChange, agents, places, items = [], conditions = [], needs = [], allowEnd = false }: Props) {
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
    form.kill.length +
    form.depart.length +
    form.health.length +
    form.spawn.length +
    form.items.length +
    form.addCondition.length +
    form.removeCondition.length +
    form.needs.length +
    form.places.length +
    form.adjust.length +
    form.rumor.length +
    (form.end ? 1 : 0) +
    Object.keys(form.world).length;

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

      {conditions.length > 0 &&
        (['addCondition', 'removeCondition'] as const).map((key) => (
          <div key={key} className="fx-row">
            <span className="fx-label">{key === 'addCondition' ? 'Pasan a estar' : 'Dejan de estar'}</span>
            <div className="fx-items">
              {form[key].map((r, i) => (
                <span key={i} className="row wrap">
                  <select className="select" value={r.target} onChange={(e) => set((f) => void (f[key][i].target = e.target.value))}>
                    {targets.map((t) => <option key={t} value={t}>{targetLabel(t)}</option>)}
                  </select>
                  <select className="select" value={r.condition} onChange={(e) => set((f) => void (f[key][i].condition = e.target.value))}>
                    {conditions.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <button className="btn" onClick={() => set((f) => void f[key].splice(i, 1))}>✕</button>
                </span>
              ))}
              <button className="btn" onClick={() => set((f) => void f[key].push({ target: agents[0] ?? 'all', condition: conditions[0] }))}>
                + {key === 'addCondition' ? 'Añadir estado' : 'Quitar estado'}
              </button>
            </div>
          </div>
        ))}

      {needs.length > 0 && (
        <div className="fx-row">
          <span className="fx-label">Necesidades</span>
          <div className="fx-items">
            {form.needs.map((r, i) => (
              <span key={i} className="row wrap">
                <select className="select" value={r.target} onChange={(e) => set((f) => void (f.needs[i].target = e.target.value))}>
                  {targets.map((t) => <option key={t} value={t}>{targetLabel(t)}</option>)}
                </select>
                <select className="select" value={r.need} onChange={(e) => set((f) => void (f.needs[i].need = e.target.value))}>
                  {needs.map((n) => <option key={n}>{n}</option>)}
                </select>
                <input className="input tiny" type="number" step={0.1} value={r.delta} title="Negativo: la satisface" onChange={(e) => set((f) => void (f.needs[i].delta = Number(e.target.value)))} />
                <button className="btn" onClick={() => set((f) => void f.needs.splice(i, 1))}>✕</button>
              </span>
            ))}
            <button className="btn" onClick={() => set((f) => void f.needs.push({ target: 'all', need: needs[0], delta: -0.5 }))}>+ Cambiar necesidad</button>
          </div>
        </div>
      )}

      <div className="fx-row">
        <span className="fx-label">Lugares</span>
        <div className="fx-items">
          {form.places.map((r, i) => (
            <span key={i} className="row wrap">
              <select className="select" value={r.place} onChange={(e) => set((f) => void (f.places[i].place = e.target.value))}>
                {places.map((p) => <option key={p}>{p}</option>)}
              </select>
              <select
                className="select"
                value={r.closed === undefined ? '' : r.closed ? 'close' : 'open'}
                onChange={(e) => set((f) => void (e.target.value ? (f.places[i].closed = e.target.value === 'close') : delete f.places[i].closed))}
              >
                <option value="">(puertas igual)</option>
                <option value="close">se cierra</option>
                <option value="open">se abre</option>
              </select>
              <select
                className="select"
                value={r.hazard === undefined ? '' : r.hazard ? 'on' : 'off'}
                onChange={(e) =>
                  set((f) => {
                    const v = e.target.value;
                    if (!v) delete f.places[i].hazard;
                    else f.places[i].hazard = v === 'on' ? { label: 'en llamas', per_tick: { health: -0.1 } } : null;
                  })
                }
              >
                <option value="">(peligro igual)</option>
                <option value="on">pasa a ser peligroso</option>
                <option value="off">deja de ser peligroso</option>
              </select>
              {r.hazard && (
                <>
                  <input className="input" placeholder="en llamas" value={r.hazard.label ?? ''} onChange={(e) => set((f) => void (f.places[i].hazard = { ...f.places[i].hazard, label: e.target.value }))} />
                  <input
                    className="input tiny"
                    type="number"
                    step={0.05}
                    title="Salud por tick"
                    value={r.hazard.per_tick?.health ?? 0}
                    onChange={(e) => set((f) => void (f.places[i].hazard = { ...f.places[i].hazard, per_tick: { ...f.places[i].hazard?.per_tick, health: Number(e.target.value) } }))}
                  />
                  {conditions.length > 0 && (
                    <select className="select" value={r.hazard.condition ?? ''} onChange={(e) => set((f) => void (f.places[i].hazard = { ...f.places[i].hazard, condition: e.target.value || undefined }))}>
                      <option value="">(sin estado)</option>
                      {conditions.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  )}
                </>
              )}
              <button className="btn" onClick={() => set((f) => void f.places.splice(i, 1))}>✕</button>
            </span>
          ))}
          <button className="btn" onClick={() => set((f) => void f.places.push({ place: places[0] ?? '', closed: true }))}>+ Cambiar un lugar</button>
        </div>
      </div>

      <div className="fx-row">
        <span className="fx-label">Sumar a variables</span>
        <div className="fx-items">
          {form.adjust.map((r, i) => (
            <span key={i} className="row">
              <input className="input" placeholder="oxygen" value={r.key} onChange={(e) => set((f) => void (f.adjust[i].key = e.target.value))} />
              <input className="input tiny" type="number" step={0.05} value={r.delta} onChange={(e) => set((f) => void (f.adjust[i].delta = Number(e.target.value)))} />
              <button className="btn" onClick={() => set((f) => void f.adjust.splice(i, 1))}>✕</button>
            </span>
          ))}
          <button className="btn" onClick={() => set((f) => void f.adjust.push({ key: 'variable', delta: -0.1 }))}>+ Sumar o restar</button>
        </div>
      </div>

      <div className="fx-row">
        <span className="fx-label">Rumores</span>
        <div className="fx-items">
          {form.rumor.map((r, i) => (
            <span key={i} className="row wrap">
              <select className="select" value={r.target} onChange={(e) => set((f) => void (f.rumor[i].target = e.target.value))}>
                {targets.map((t) => <option key={t} value={t}>{targetLabel(t)}</option>)}
              </select>
              <input className="input grow" placeholder="Lo que se cuenta" value={r.text} onChange={(e) => set((f) => void (f.rumor[i].text = e.target.value))} />
              <select
                className="select"
                value={r.truth === null ? '' : String(r.truth)}
                onChange={(e) => set((f) => void (f.rumor[i].truth = e.target.value === '' ? null : e.target.value === 'true'))}
              >
                <option value="">¿?</option>
                <option value="true">cierto</option>
                <option value="false">falso</option>
              </select>
              <button className="btn" onClick={() => set((f) => void f.rumor.splice(i, 1))}>✕</button>
            </span>
          ))}
          <button className="btn" onClick={() => set((f) => void f.rumor.push({ target: agents[0] ?? 'all', text: 'Dicen que…', truth: false }))}>+ Rumor</button>
        </div>
      </div>

      {allowEnd && (
        <label className="fx-row">
          <span className="fx-label">Termina la simulación</span>
          <input className="input" placeholder="(no) · texto del final, p. ej. «La colonia ha caído»" value={form.end} onChange={(e) => set((f) => void (f.end = e.target.value))} />
        </label>
      )}

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
