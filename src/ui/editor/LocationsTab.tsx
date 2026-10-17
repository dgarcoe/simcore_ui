import { useRef, useState } from 'react';
import { LOCATION_TYPES, type ScenarioConfig } from '../../api/scenario';
import { resolveRole, ZONE_ROLES } from '../../game/map/roles';
import { AmountsField } from './AmountsField';
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
