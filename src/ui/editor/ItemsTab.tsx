import { useState } from 'react';
import { itemsUsed, type ItemConfig } from '../../api/scenario';
import { ChipPicker } from './ChipPicker';
import { prune } from './RulesWidgets';
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
            <span className="fx-label">Arma</span>
            <div className="fx-items">
              <label className="toggle">
                <input type="checkbox" checked={!!it.weapon} onChange={(e) => setItem(key, (x) => void (e.target.checked ? (x.weapon = { damage: 0.4, chance: 0.7 }) : delete x.weapon))} />
                Sirve para atacar
              </label>
              {it.weapon && (
                <>
                  <span className="row">
                    <span className="trait-label">Daño</span>
                    <input type="range" min={0.05} max={1} step={0.05} value={it.weapon.damage ?? 0.4} onChange={(e) => setItem(key, (x) => void (x.weapon = { ...x.weapon, damage: Number(e.target.value) }))} />
                    <span className="dim">{(it.weapon.damage ?? 0.4).toFixed(2)}</span>
                  </span>
                  <span className="row">
                    <span className="trait-label">Acierto</span>
                    <input type="range" min={0.05} max={1} step={0.05} value={it.weapon.chance ?? 0.7} onChange={(e) => setItem(key, (x) => void (x.weapon = { ...x.weapon, chance: Number(e.target.value) }))} />
                    <span className="dim">{Math.round((it.weapon.chance ?? 0.7) * 100)}%</span>
                  </span>
                  <label className="toggle" title="Modo rol: se apunta con destreza en vez de fuerza">
                    <input type="checkbox" checked={!!it.weapon.ranged} onChange={(e) => setItem(key, (x) => void (x.weapon = prune({ ...x.weapon, ranged: e.target.checked || undefined })))} />
                    A distancia
                  </label>
                  <label className="row">
                    <span className="trait-label">Munición</span>
                    <select className="select" value={it.weapon.ammo ?? ''} onChange={(e) => setItem(key, (x) => void (x.weapon = prune({ ...x.weapon, ammo: e.target.value })))}>
                      <option value="">(no gasta nada)</option>
                      {Object.keys(catalog).filter((k) => k !== key).map((k) => <option key={k}>{k}</option>)}
                    </select>
                  </label>
                </>
              )}
            </div>
          </div>
          <div className="fx-row">
            <span className="fx-label">Codiciado</span>
            <div className="fx-items">
              <label className="toggle" title="Todos ven quién lo lleva (una corona, un sello, la única llave)">
                <input type="checkbox" checked={!!it.visible} onChange={(e) => setItem(key, (x) => void (e.target.checked ? (x.visible = true) : delete x.visible))} />
                Se ve quién lo lleva
              </label>
              <label className="toggle" title="Cae al suelo donde muere o se va quien lo lleva, y otro puede cogerlo">
                <input type="checkbox" checked={!!it.drops} onChange={(e) => setItem(key, (x) => void (e.target.checked ? (x.drops = true) : delete x.drops))} />
                Cae al morir
              </label>
            </div>
          </div>
          <label className="fx-row" title="Modo rol: suma a la defensa de quien lo lleva (10 + DES + armadura)">
            <span className="fx-label">Armadura</span>
            <input className="input" type="number" min={0} max={10} value={it.armor ?? 0} onChange={(e) => setItem(key, (x) => void (Number(e.target.value) > 0 ? (x.armor = Math.min(10, Number(e.target.value))) : delete x.armor))} />
          </label>
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
