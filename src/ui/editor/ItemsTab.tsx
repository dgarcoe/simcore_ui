import { useState } from 'react';
import { itemsUsed, type ItemConfig } from '../../api/scenario';
import { ChipPicker } from './ChipPicker';
import { useDraft } from './draft';

const EFFECTS: Array<['health' | 'energy' | 'mood', string]> = [
  ['health', 'Salud'],
  ['energy', 'Energía'],
  ['mood', 'Ánimo'],
];

/** Item catalog: what each object is and what using it does. */
export function ItemsTab() {
  const [draft, update] = useDraft();
  const [name, setName] = useState('');
  const catalog = draft.items ?? {};
  const missing = itemsUsed(draft).filter((n) => !catalog[n]);
  const setItem = (key: string, fn: (it: ItemConfig) => void) => update((d) => fn(((d.items ??= {})[key] ??= {})));
  const add = (key: string) => key.trim() && update((d) => void ((d.items ??= {})[key.trim()] ??= { description: '', consumable: true }));

  return (
    <div className="ed-section">
      <h3>Objetos ({Object.keys(catalog).length})</h3>
      <p className="dim small">
        Los agentes pueden dar, coger, dejar, usar e intercambiar objetos. Aquí describes cada uno y qué pasa al usarlo (por ejemplo, un
        botiquín da +0.4 de salud a quien lo recibe). Los objetos sin ficha también funcionan, pero no se pueden usar.
      </p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          add(name);
          setName('');
        }}
      >
        <input className="input grow" placeholder="Nombre del objeto (medicine, food, ammo…)" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn" type="submit">+ Objeto</button>
      </form>
      {missing.length > 0 && (
        <p className="small">
          Usados en el escenario sin ficha:{' '}
          {missing.map((m) => (
            <button key={m} className="chip-btn" onClick={() => add(m)}>+ {m}</button>
          ))}
        </p>
      )}
      {Object.entries(catalog).map(([key, it]) => (
        <article key={key} className="ed-card">
          <div className="row">
            <strong className="grow">{key}</strong>
            <label className="toggle">
              <input type="checkbox" checked={it.consumable !== false} onChange={(e) => setItem(key, (x) => void (x.consumable = e.target.checked))} />
              Se gasta al usarlo
            </label>
            <button
              className="btn"
              title="Eliminar del catálogo"
              onClick={() =>
                update((d) => {
                  delete d.items![key];
                  if (!Object.keys(d.items!).length) delete d.items;
                })
              }
            >
              ✕
            </button>
          </div>
          <input className="input" placeholder="Descripción (los agentes la leen)" value={it.description ?? ''} onChange={(e) => setItem(key, (x) => void (x.description = e.target.value))} />
          {Object.keys(draft.conditions ?? {}).length > 0 && (
            <span className="row wrap">
              <span className="trait-label">Cura</span>
              <ChipPicker
                options={Object.keys(draft.conditions ?? {})}
                value={it.cures}
                onChange={(v) => setItem(key, (x) => void (v.length ? (x.cures = v) : delete x.cures))}
              />
            </span>
          )}
          <div className="fx-row">
            <span className="fx-label">Al usarlo</span>
            <div className="fx-items">
              {EFFECTS.map(([k, label]) => {
                const v = it.on_use?.[k] ?? 0;
                return (
                  <span key={k} className="row">
                    <span className="trait-label">{label}</span>
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.05}
                      value={v}
                      onChange={(e) =>
                        setItem(key, (x) => {
                          const n = Number(e.target.value);
                          const use = (x.on_use ??= {});
                          if (n) use[k] = n;
                          else delete use[k];
                          if (!Object.keys(use).length) delete x.on_use;
                        })
                      }
                    />
                    <span className={v < 0 ? 'bad-text' : v > 0 ? 'ok-text' : 'dim'}>{v > 0 ? '+' : ''}{v.toFixed(2)}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
