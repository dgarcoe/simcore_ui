import type { Compare, Orders, PlanWhen } from '../api/scenario';

export const STYLES: Array<[string, string]> = [
  ['agresivo', 'Agresivo: pelea y asalta cuando las tiradas le acompañan'],
  ['negociador', 'Negociador: pactos, intercambios y convencer'],
  ['sigiloso', 'Sigiloso: palos, espiar y no dejarse ver'],
  ['leal', 'Leal: defiende a su banda y sus barrios'],
  ['oportunista', 'Oportunista: lo suyo primero; cambia de bando si compensa'],
  ['empresario', 'Empresario: encargos, negocios y la caja'],
];

export const PRIORITIES = ['que gane mi banda', 'ser la leyenda', 'conseguir el maletín', 'no caer nunca', 'ganar dinero'];

const RISKS: Array<[NonNullable<Orders['risk']>, string]> = [
  ['', '(sin indicar)'],
  ['careful', 'Prudente: solo con buenas probabilidades'],
  ['bold', 'Atrevido: se arriesga con probabilidades razonables'],
  ['reckless', 'Temerario: a por todas'],
];

const RED_LINES: Array<[string, string, string]> = [
  ['attack', 'my_group', 'Pegar a alguien de mi banda'],
  ['leave', '', 'Dejar mi banda'],
  ['chivarse', '', 'Chivarse a la policía'],
  ['dar_un_palo', 'my_group', 'Robar a alguien de mi banda'],
];

type PlanKind = 'day' | 'group_rank' | 'my_rank' | 'carries' | 'knocked_out' | 'group_territories';
const PLAN_KINDS: Array<[PlanKind, string]> = [
  ['day', 'A partir del día…'],
  ['group_rank', 'Si mi banda va en el puesto… o peor'],
  ['my_rank', 'Si yo voy en el puesto… o mejor'],
  ['group_territories', 'Si mi banda tiene … barrios o menos'],
  ['carries', 'Si llevo el objeto…'],
  ['knocked_out', 'Si me acaban de dejar K.O.'],
];

function planKind(w: PlanWhen): PlanKind {
  if (w.group_rank) return 'group_rank';
  if (w.my_rank) return 'my_rank';
  if (w.group_territories) return 'group_territories';
  if (w.carries) return 'carries';
  if (w.knocked_out) return 'knocked_out';
  return 'day';
}

function planValue(w: PlanWhen): string {
  const n = (c?: Compare) => String(Object.values(c ?? {})[0] ?? '');
  return String(w.day ?? n(w.group_rank) ?? '') || n(w.my_rank) || n(w.group_territories) || w.carries || '';
}

function makeWhen(kind: PlanKind, value: string): PlanWhen {
  const n = Math.max(1, Number(value) || 1);
  switch (kind) {
    case 'day':
      return { day: n };
    case 'group_rank':
      return { group_rank: { gte: n } };
    case 'my_rank':
      return { my_rank: { lte: n } };
    case 'group_territories':
      return { group_territories: { lte: Number(value) || 0 } };
    case 'carries':
      return { carries: value.trim() };
    case 'knocked_out':
      return { knocked_out: true };
  }
}

/** What a player tells their agent to do to win: it reads it every turn above everything else. */
export function OrdersForm({ orders, readOnly, onChange }: { orders: Orders; readOnly?: boolean; onChange: (o: Orders) => void }) {
  const set = (patch: Partial<Orders>) => onChange(prune({ ...orders, ...patch }));
  const priorities = orders.priorities ?? [];
  const lines = orders.red_lines ?? [];
  const plans = orders.plans ?? [];
  const has = (a: string, t: string) => lines.some((l) => l.action === a && (l.target ?? '') === t);
  const move = (i: number, d: number) => {
    const next = [...priorities];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set({ priorities: next });
  };

  return (
    <fieldset className="player-form orders-form" disabled={readOnly}>
      <p className="dim small">Tu agente leerá estas órdenes en cada turno, antes que nada. Nadie más las ve.</p>
      <label>
        Estilo
        <select className="select" value={orders.style ?? ''} onChange={(e) => set({ style: e.target.value })}>
          <option value="">(sin estilo)</option>
          {STYLES.map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </label>
      <div className="player-block">
        <h4>Qué importa más, en orden</h4>
        <ol className="priorities">
          {priorities.map((p, i) => (
            <li key={p}>
              {p}
              <span className="row nowrap">
                <button type="button" className="btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir">↑</button>
                <button type="button" className="btn" disabled={i === priorities.length - 1} onClick={() => move(i, 1)} aria-label="Bajar">↓</button>
                <button type="button" className="btn" onClick={() => set({ priorities: priorities.filter((x) => x !== p) })} aria-label="Quitar">✕</button>
              </span>
            </li>
          ))}
        </ol>
        <div className="row wrap">
          {PRIORITIES.filter((p) => !priorities.includes(p)).map((p) => (
            <button key={p} type="button" className="chip-btn" onClick={() => set({ priorities: [...priorities, p] })}>+ {p}</button>
          ))}
        </div>
      </div>
      <label>
        Riesgo
        <select className="select" value={orders.risk ?? ''} onChange={(e) => set({ risk: e.target.value as Orders['risk'] })}>
          {RISKS.map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </label>
      <div className="player-block">
        <h4>Líneas rojas: tu agente nunca…</h4>
        <div className="row wrap">
          {RED_LINES.map(([a, t, label]) => (
            <label key={`${a}:${t}`} className="toggle">
              <input
                type="checkbox"
                checked={has(a, t)}
                onChange={(e) =>
                  set({
                    red_lines: e.target.checked
                      ? [...lines, t ? { action: a, target: t } : { action: a }].slice(0, 5)
                      : lines.filter((l) => !(l.action === a && (l.target ?? '') === t)),
                  })
                }
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <div className="player-block">
        <h4>Planes: si pasa algo, haz esto (hasta 3)</h4>
        {plans.map((p, i) => {
          const kind = planKind(p.when);
          const put = (patch: Partial<{ kind: PlanKind; value: string; then: string }>) => {
            const next = [...plans];
            next[i] = {
              when: makeWhen(patch.kind ?? kind, patch.value ?? planValue(p.when)),
              then: patch.then ?? p.then,
            };
            set({ plans: next });
          };
          return (
            <div key={i} className="plan-row">
              <select className="select" value={kind} onChange={(e) => put({ kind: e.target.value as PlanKind })}>
                {PLAN_KINDS.map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
              {kind !== 'knocked_out' && (
                <input className="input" style={{ width: kind === 'carries' ? 120 : 60 }} value={planValue(p.when)} onChange={(e) => put({ value: e.target.value })} />
              )}
              <input className="input grow" maxLength={200} placeholder="…entonces (p. ej. «Pásate a la banda que vaya primera»)" value={p.then} onChange={(e) => put({ then: e.target.value })} />
              <button type="button" className="btn" onClick={() => set({ plans: plans.filter((_, j) => j !== i) })} aria-label="Quitar plan">✕</button>
            </div>
          );
        })}
        {plans.length < 3 && (
          <button type="button" className="btn" onClick={() => set({ plans: [...plans, { when: { day: 2 }, then: '' }] })}>+ Plan</button>
        )}
      </div>
      <label>
        En tus palabras (hasta 400 caracteres)
        <textarea className="input" rows={3} maxLength={400} value={orders.text ?? ''} onChange={(e) => set({ text: e.target.value })} placeholder="Nada de peleas a lo loco: palos limpios y a casa." />
      </label>
    </fieldset>
  );
}

function prune(o: Orders): Orders {
  const out: Orders = {};
  if (o.style) out.style = o.style;
  if (o.priorities?.length) out.priorities = o.priorities;
  if (o.risk) out.risk = o.risk;
  if (o.red_lines?.length) out.red_lines = o.red_lines;
  if (o.plans?.length) out.plans = o.plans;
  if (o.text) out.text = o.text;
  return out;
}

/** «Sigiloso · prioridades: ser la leyenda › que gane mi banda · nunca: dejar mi banda». */
export function ordersSummary(o: Orders | undefined): string {
  if (!o) return '';
  const bits = [
    o.style,
    o.priorities?.length ? `prioridades: ${o.priorities.join(' › ')}` : '',
    o.risk ? `riesgo: ${RISKS.find(([k]) => k === o.risk)?.[1].split(':')[0] ?? o.risk}` : '',
    o.red_lines?.length ? `nunca: ${o.red_lines.map((l) => RED_LINES.find(([a, t]) => a === l.action && t === (l.target ?? ''))?.[2] ?? `${l.action} ${l.target ?? ''}`).join(', ')}` : '',
    o.plans?.length ? `${o.plans.length} plan${o.plans.length > 1 ? 'es' : ''}` : '',
    o.text ? `«${o.text}»` : '',
  ];
  return bits.filter(Boolean).join(' · ');
}
