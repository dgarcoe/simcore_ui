import { useRef, useState } from 'react';
import { LOCATION_TYPES, type ScenarioConfig } from '../../api/scenario';
import { resolveRole, ZONE_ROLES } from '../../game/map/roles';
import { AmountsField } from './AmountsField';
import { prune, RequirementEditor, StatSliders } from './RulesWidgets';
import { useDraft } from './draft';

const ROLE_LABEL: Record<string, string> = {
  medical: 'médico',
  commerce: 'comercio',
  storage: 'almacén',
  production: 'producción',
  engineering: 'ingeniería',
  command: 'mando',
  quarters: 'viviendas',
  social: 'social',
  education: 'educación',
  agriculture: 'agricultura',
  leisure: 'ocio',
  transit: 'tránsito',
  combat: 'combate',
  generic: 'genérico',
};

const ROLE_COLOR: Record<string, string> = {
  medical: '#b13e53',
  commerce: '#3b5dc9',
  storage: '#8f563b',
  production: '#566c86',
  engineering: '#ef7d57',
  command: '#29366f',
  quarters: '#d9a066',
  social: '#5d275d',
  education: '#257179',
  agriculture: '#38b764',
  leisure: '#a7f070',
  transit: '#73eff7',
  combat: '#7c2f2f',
  generic: '#94b0c2',
};

export function roleOf(l: ScenarioConfig['environment']['locations'][number]) {
  return resolveRole({ name: l.name, type: l.type ?? 'generic', properties: l.properties ?? {} });
}

interface Props {
  selected: number | null;
  onSelect: (i: number | null) => void;
}

export function LocationsTab({ selected, onSelect }: Props) {
  const [draft, update] = useDraft();
  const locs = draft.environment.locations;

  return (
    <div className="ed-section">
      <GridPlacer selected={selected} onSelect={onSelect} />
      <div className="row between">
        <h3>Lugares</h3>
        <button
          className="btn"
          onClick={() =>
            update((d) => {
              const [w, h] = d.environment.size ?? [20, 20];
              const taken = new Set(d.environment.locations.map((l) => `${l.position?.[0]},${l.position?.[1]}`));
              let pos: [number, number] = [Math.floor(w / 2), Math.floor(h / 2)];
              for (let i = 0; i < w * h && taken.has(pos.join(',')); i++) pos = [i % w, Math.floor(i / w)];
              d.environment.locations.push({
                name: `Lugar ${d.environment.locations.length + 1}`,
                type: 'generic',
                position: pos,
                capacity: 20,
                properties: { description: '' },
              });
              onSelect(d.environment.locations.length - 1);
            })
          }
        >
          + Lugar
        </button>
      </div>
      {locs.some((l) => l.territory) && <TerritoryRules />}
      {locs.map((l, i) => {
        const role = roleOf(l);
        const set = (fn: (x: typeof l, d: ScenarioConfig) => void) => update((d) => fn(d.environment.locations[i], d));
        return (
          <article key={i} className={`ed-card ${selected === i ? 'on' : ''}`} onFocus={() => onSelect(i)} onClick={() => onSelect(i)}>
            <div className="row">
              <span className="swatch" style={{ background: ROLE_COLOR[role] }} title={ROLE_LABEL[role]} />
              <input
                className="input grow"
                value={l.name}
                placeholder="Nombre"
                onChange={(e) =>
                  set((x, d) => {
                    const old = x.name;
                    x.name = e.target.value;
                    // keep agents pointing at the renamed place
                    for (const a of d.agents) if (a.starting_location === old) a.starting_location = x.name;
                  })
                }
              />
              <button
                className="btn"
                title="Eliminar lugar"
                onClick={(e) => {
                  e.stopPropagation();
                  update((d) => void d.environment.locations.splice(i, 1));
                  onSelect(null);
                }}
              >
                ✕
              </button>
            </div>
            <div className="ed-grid">
              <label>
                Tipo
                <select className="select" value={l.type ?? 'generic'} onChange={(e) => set((x) => void (x.type = e.target.value))}>
                  {[...new Set([...LOCATION_TYPES, l.type ?? 'generic'])].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                Aspecto
                <select
                  className="select"
                  value={String(l.properties?.ui_role ?? '')}
                  onChange={(e) =>
                    set((x) => {
                      x.properties ??= {};
                      if (e.target.value) x.properties.ui_role = e.target.value;
                      else delete x.properties.ui_role;
                    })
                  }
                >
                  <option value="">Auto: {ROLE_LABEL[role]}</option>
                  {ZONE_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>
              </label>
              <label>
                Capacidad
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={l.capacity ?? 20}
                  onChange={(e) => set((x) => void (x.capacity = Math.max(1, Number(e.target.value) || 1)))}
                />
              </label>
              <label className="toggle">
                <input type="checkbox" checked={!!l.virtual} onChange={(e) => set((x) => void (x.virtual = e.target.checked))} />
                Virtual (red social, chat)
              </label>
            </div>
            <details>
              <summary>Puertas, acceso y peligro{l.closed || l.access || l.hazard ? ' ●' : ''}</summary>
              <label className="toggle">
                <input type="checkbox" checked={!!l.closed} onChange={(e) => set((x) => void (e.target.checked ? (x.closed = true) : delete x.closed))} /> Cerrado (nadie puede entrar)
              </label>
              <div className="fx-row">
                <span className="fx-label">Solo pueden entrar</span>
                <RequirementEditor
                  conditions={Object.keys(draft.conditions ?? {})}
                  value={l.access ?? undefined}
                  onChange={(r) => set((x) => void (Object.keys(prune(r)).length ? (x.access = prune(r)) : delete x.access))}
                />
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={!!l.hazard}
                  onChange={(e) => set((x) => void (e.target.checked ? (x.hazard = { label: 'en llamas', per_tick: { health: -0.1 } }) : delete x.hazard))}
                />{' '}
                Peligroso
              </label>
              {l.hazard && (
                <div className="fx-row">
                  <span className="fx-label">Peligro</span>
                  <div className="fx-items">
                    <input className="input" placeholder="en llamas, inundado…" value={l.hazard.label ?? ''} onChange={(e) => set((x) => void (x.hazard = { ...x.hazard, label: e.target.value }))} />
                    <StatSliders value={l.hazard.per_tick} onChange={(v) => set((x) => void (x.hazard = { ...x.hazard, per_tick: v }))} />
                    {Object.keys(draft.conditions ?? {}).length > 0 && (
                      <select className="select" value={l.hazard.condition ?? ''} onChange={(e) => set((x) => void (x.hazard = prune({ ...x.hazard, condition: e.target.value })))}>
                        <option value="">(no añade estado)</option>
                        {Object.keys(draft.conditions ?? {}).map((c) => <option key={c}>{c}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              )}
            </details>
            <div className="ed-grid">
              <AmountsField
                label="Existencias (se pueden coger)"
                value={l.stock}
                onChange={(r) => set((x) => void (Object.keys(r).length ? (x.stock = r) : delete x.stock))}
              />
              <AmountsField
                label="Produce al trabajar aquí"
                value={l.produces}
                placeholder="food: 2"
                onChange={(r) => set((x) => void (Object.keys(r).length ? (x.produces = r) : delete x.produces))}
              />
              <label className="toggle" title="Los grupos se lo disputan: vacío o sin defensores es del grupo con más gente aquí; con defensores hay que superarlos en número varios turnos seguidos. Da sus ingresos a lo común del grupo que lo controla">
                <input type="checkbox" checked={!!l.territory} onChange={(e) => set((x) => void (e.target.checked ? (x.territory = true) : (delete x.territory, delete x.income)))} />
                Territorio (lo que se disputan los grupos)
              </label>
              {l.territory && (
                <AmountsField
                  label="Ingresos para el grupo que lo controla"
                  value={l.income}
                  placeholder="dinero: 2"
                  onChange={(r) => set((x) => void (Object.keys(r).length ? (x.income = r) : delete x.income))}
                />
              )}
              <label className="toggle" title="Aquí se compra y se vende con la moneda del escenario; los precios suben al comprar y bajan al vender">
                <input type="checkbox" checked={!!l.market} onChange={(e) => set((x) => void (e.target.checked ? (x.market = { sells: {}, buys: {} }) : delete x.market))} />
                Mercado
              </label>
              {l.market && (
                <>
                  <AmountsField label="Vende (objeto: precio)" value={l.market.sells} placeholder="chaleco: 5, botiquin: 2" onChange={(r) => set((x) => void (x.market!.sells = r))} />
                  <AmountsField label="Compra (objeto: lo que paga)" value={l.market.buys} placeholder="mercancia: 3" onChange={(r) => set((x) => void (x.market!.buys = r))} />
                  <AmountsField label="Existencias limitadas (vacío: no se agotan)" value={l.market.stock} placeholder="chaleco: 3" onChange={(r) => set((x) => void (Object.keys(r).length ? (x.market!.stock = r) : delete x.market!.stock))} />
                  <label className="toggle" title="Abre solo entre estas horas (p. ej. de 20 a 6). Vacío: siempre abierto">
                    Abre de
                    <input className="input" type="number" min={0} max={24} style={{ width: 54 }} value={l.market.hours?.[0] ?? ''} placeholder="—" onChange={(e) => set((x) => void (e.target.value === '' ? delete x.market!.hours : (x.market!.hours = [Number(e.target.value), x.market!.hours?.[1] ?? 6])))} />
                    a
                    <input className="input" type="number" min={0} max={24} style={{ width: 54 }} value={l.market.hours?.[1] ?? ''} placeholder="—" onChange={(e) => set((x) => void (e.target.value === '' ? delete x.market!.hours : (x.market!.hours = [x.market!.hours?.[0] ?? 20, Number(e.target.value)])))} />
                    h
                  </label>
                </>
              )}
            </div>
            <textarea
              className="input"
              rows={2}
              placeholder="Descripción (los agentes la leen)"
              value={String(l.properties?.description ?? '')}
              onChange={(e) => set((x) => void ((x.properties ??= {}).description = e.target.value))}
            />
          </article>
        );
      })}
    </div>
  );
}

/** How territories are taken and what they pay (shown once any place is a territory). */
function TerritoryRules() {
  const [draft, update] = useDraft();
  const t = draft.territories ?? {};
  const set = (k: keyof NonNullable<ScenarioConfig['territories']>, v: number) => update((d) => void ((d.territories ??= {})[k] = v));
  const words = (draft.environment.global_state?.ui_words ?? {}) as Record<string, string>;
  // only the singular: the UI makes the plural (or keeps one the YAML already has, if it still fits)
  const setWord = (k: 'group' | 'territory', v: string) =>
    update((d) => {
      const gs = (d.environment.global_state ??= {});
      const next = { ...((gs.ui_words as Record<string, string> | undefined) ?? {}) };
      delete next[k === 'group' ? 'groups' : 'territories'];
      if (v.trim()) next[k] = v;
      else delete next[k];
      if (Object.keys(next).length) gs.ui_words = next;
      else delete gs.ui_words;
    });
  return (
    <div className="ed-grid">
      <label title="Turnos seguidos que un grupo rival tiene que superar en número a los defensores para quitarles el territorio (un empate lo conserva el dueño)">
        Turnos de asedio para tomar un territorio defendido
        <input className="input" type="number" min={1} value={t.siege ?? 2} onChange={(e) => set('siege', Math.max(1, Number(e.target.value) || 1))} />
      </label>
      <label title="Parte de sus ingresos que paga un territorio mientras hay rivales dentro">
        Ingresos en disputa (%)
        <input className="input" type="number" min={0} max={100} value={Math.round((t.contested_income ?? 0.5) * 100)} onChange={(e) => set('contested_income', Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100)} />
      </label>
      <label title="Cada cuántos turnos pagan los territorios">
        Turnos entre ingresos
        <input className="input" type="number" min={1} value={t.every ?? 4} onChange={(e) => set('every', Math.max(1, Number(e.target.value) || 1))} />
      </label>
      <label title="Cómo llama este escenario a sus grupos en la UI (banda, tripulación, casa…). Vacío: «grupo»">
        Nombre de los grupos
        <input className="input" placeholder="grupo" value={words.group ?? ''} onChange={(e) => setWord('group', e.target.value)} />
      </label>
      <label title="Cómo llama a los territorios (barrio, sector, feudo…). Vacío: «territorio»">
        Nombre de los territorios
        <input className="input" placeholder="territorio" value={words.territory ?? ''} onChange={(e) => setWord('territory', e.target.value)} />
      </label>
      <label title="Puntos que suma a su grupo cada territorio que controla">
        Puntos por territorio para el grupo
        <input className="input" type="number" value={t.group_points ?? 0} onChange={(e) => set('group_points', Number(e.target.value) || 0)} />
      </label>
    </div>
  );
}

/** Drag places around the scenario grid; positions decide how the map is laid out. */
function GridPlacer({ selected, onSelect }: Props) {
  const [draft, update] = useDraft();
  const gridRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [w, h] = draft.environment.size ?? [20, 20];
  const locs = draft.environment.locations;

  const cellAt = (e: React.PointerEvent): [number, number] | null => {
    const r = gridRef.current!.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * w);
    const y = Math.floor(((e.clientY - r.top) / r.height) * h);
    return x < 0 || y < 0 || x >= w || y >= h ? null : [x, y];
  };
  const moveTo = (i: number, cell: [number, number]) =>
    update((d) => void (d.environment.locations[i].position = cell));

  return (
    <div className="placer">
      <div className="row between">
        <h3>Disposición</h3>
        <span className="row">
          Cuadrícula
          <input
            className="input tiny"
            type="number"
            min={4}
            max={40}
            value={w}
            onChange={(e) => update((d) => void (d.environment.size = [clampSize(e.target.value), h]))}
          />
          ×
          <input
            className="input tiny"
            type="number"
            min={4}
            max={40}
            value={h}
            onChange={(e) => update((d) => void (d.environment.size = [w, clampSize(e.target.value)]))}
          />
        </span>
      </div>
      <div
        ref={gridRef}
        className="placer-grid"
        style={{
          gridTemplateColumns: `repeat(${w}, 1fr)`,
          gridTemplateRows: `repeat(${h}, 1fr)`,
          aspectRatio: `${w} / ${h}`,
          width: `min(100%, ${Math.round((340 * w) / h)}px)`,
          ['--cols' as string]: w,
          ['--rows' as string]: h,
        }}
        onPointerMove={(e) => {
          if (dragging === null) return;
          const cell = cellAt(e);
          if (cell) moveTo(dragging, cell);
        }}
        onPointerUp={() => setDragging(null)}
        onPointerLeave={() => setDragging(null)}
        onClick={(e) => {
          // click on an empty cell moves the selected place there
          if (selected === null || (e.target as HTMLElement).closest('.token')) return;
          const cell = cellAt(e as unknown as React.PointerEvent);
          if (cell) moveTo(selected, cell);
        }}
      >
        {locs.map((l, i) =>
          l.virtual ? null : (
            <button
              key={i}
              className={`token ${selected === i ? 'on' : ''}`}
              style={{
                gridColumn: (l.position?.[0] ?? 0) + 1,
                gridRow: (l.position?.[1] ?? 0) + 1,
                background: ROLE_COLOR[roleOf(l)],
              }}
              title={l.name}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
                setDragging(i);
                onSelect(i);
              }}
            >
              {initials(l.name)}
            </button>
          ),
        )}
      </div>
      <p className="dim small">
        Arrastra los lugares para colocarlos. El mapa conserva su orden relativo (izquierda/derecha, arriba/abajo).
      </p>
    </div>
  );
}

function clampSize(v: string): number {
  return Math.max(4, Math.min(40, Number(v) || 4));
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase() || '?'
  );
}
