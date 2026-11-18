import type { Compare, Orders, PlanWhen, ScenarioConfig } from '../api/scenario';
import { DEFAULT_WORDS, useWords, type Words } from '../lib/words';
import { useSim } from '../store/simStore';

export const STYLES: Array<[string, string]> = [
  ['agresivo', 'Agresivo: pelea y va a por sus rivales cuando las tiradas le acompañan'],
  ['negociador', 'Negociador: pactos, intercambios y convencer'],
  ['sigiloso', 'Sigiloso: actúa sin dejarse ver, espía y coge lo que necesita'],
  ['leal', 'Leal: defiende a los suyos y lo que es de su grupo'],
  ['oportunista', 'Oportunista: lo suyo primero; cambia de bando si compensa'],
  ['empresario', 'Empresario: trabajar, comerciar y hacer crecer lo común'],
];

const RISKS: Array<[NonNullable<Orders['risk']>, string]> = [
  ['', '(sin indicar)'],
  ['careful', 'Prudente: solo con buenas probabilidades'],
  ['bold', 'Atrevido: se arriesga con probabilidades razonables'],
  ['reckless', 'Temerario: a por todas'],
];

/** What the player may pick from, taken from the scenario (Simcore's /api/play options). */
export interface OrdersOptions {
  /** The scenario's own actions, for red lines. */
  actions?: Array<{ name: string; description: string; target: boolean }>;
  /** Items everyone sees who carries: prizes to go after. */
  prizes?: string[];
  /** Whether there are groups and places to hold. */
  groups?: boolean;
  territories?: boolean;
}

/** Options from a scenario config (the DM's side, where there is no game). */
export function optionsFromConfig(cfg: ScenarioConfig | null | undefined): OrdersOptions {
  if (!cfg) return {};
  return {
    actions: Object.entries(cfg.actions ?? {}).map(([name, a]) => ({ name, description: a.description || name, target: a.target === 'agent' })),
    prizes: Object.entries(cfg.items ?? {}).filter(([, i]) => i.visible).map(([n]) => n),
    groups: !!(cfg.factions && Object.keys(cfg.factions).length) || !!cfg.society,
    territories: cfg.environment.locations.some((l) => l.territory),
  };
}

const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function priorityChoices(w: Words, o: OrdersOptions): string[] {
  return [
    ...(o.groups !== false ? [`que gane mi ${w.group}`] : []),
    'tener más puntos que nadie',
    ...(o.prizes ?? []).map((p) => `conseguir ${p.replace(/_/g, ' ')}`),
    'sobrevivir',
    ...(o.territories ? [`defender nuestros ${w.territories}`] : []),
    'hacer amigos',
    'acumular recursos',
  ];
}

/** Red lines a player can tick: [action, target, label]. */
export function redLineChoices(w: Words, o: OrdersOptions): Array<[string, string, string]> {
  const out: Array<[string, string, string]> = [];
  if (o.groups !== false) {
    out.push(['attack', 'my_group', `Atacar a alguien de mi ${w.group}`]);
    out.push(['leave', '', `Dejar mi ${w.group}`]);
  }
  out.push(['attack', '', 'Atacar a nadie']);
  for (const a of (o.actions ?? []).slice(0, 10)) {
    out.push([a.name, '', `Nunca: ${short(a.description)}`]);
    if (a.target && o.groups !== false) out.push([a.name, 'my_group', `${short(a.description, 40)} (a alguien de mi ${w.group})`]);
  }
  return out;
}

type PlanKind = 'day' | 'group_rank' | 'my_rank' | 'carries' | 'knocked_out' | 'group_territories';
function planKinds(w: Words, o: OrdersOptions): Array<[PlanKind, string]> {
  return [
    ['day', 'A partir del día…'],
    ...(o.groups !== false ? ([['group_rank', `Si mi ${w.group} va en el puesto… o peor`]] as Array<[PlanKind, string]>) : []),
    ['my_rank', 'Si yo voy en el puesto… o mejor'],
    ...(o.territories ? ([['group_territories', `Si mi ${w.group} tiene … ${w.territories} o menos`]] as Array<[PlanKind, string]>) : []),
    ['carries', 'Si llevo el objeto…'],
    ['knocked_out', 'Si me acaban de dejar K.O.'],
  ];
}

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
export function OrdersForm({ orders, readOnly, options, onChange }: { orders: Orders; readOnly?: boolean; options?: OrdersOptions; onChange: (o: Orders) => void }) {
  const w = useWords();
  const config = useSim((s) => s.scenarioConfig ?? s.editing?.draft ?? null);
  const opts = options ?? optionsFromConfig(config);
  const PRIORITIES = priorityChoices(w, opts);
  const RED_LINES = redLineChoices(w, opts);
  const PLAN_KINDS = planKinds(w, opts);
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
              <input className="input grow" maxLength={200} placeholder={`…entonces (p. ej. «Pásate al ${w.group} que vaya primero»)`} value={p.then} onChange={(e) => put({ then: e.target.value })} />
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
        <textarea className="input" rows={3} maxLength={400} value={orders.text ?? ''} onChange={(e) => set({ text: e.target.value })} placeholder="Sin riesgos tontos: primero los míos, luego lo demás." />
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

/** «Sigiloso · prioridades: tener más puntos que nadie › que gane mi grupo · nunca: dejar mi grupo». */
export function ordersSummary(o: Orders | undefined, w: Words = DEFAULT_WORDS, opts: OrdersOptions = {}): string {
  if (!o) return '';
  const lines = redLineChoices(w, opts);
  const bits = [
    o.style,
    o.priorities?.length ? `prioridades: ${o.priorities.join(' › ')}` : '',
    o.risk ? `riesgo: ${RISKS.find(([k]) => k === o.risk)?.[1].split(':')[0] ?? o.risk}` : '',
    o.red_lines?.length
      ? `nunca: ${o.red_lines
          .map((l) => lines.find(([a, t]) => a === l.action && t === (l.target ?? ''))?.[2].replace(/^Nunca: /, '') ?? `${l.action.replace(/_/g, ' ')}${l.target === 'my_group' ? ` (a alguien de mi ${w.group})` : l.target ? ` ${l.target}` : ''}`)
          .join(', ')}`
      : '',
    o.plans?.length ? `${o.plans.length} plan${o.plans.length > 1 ? 'es' : ''}` : '',
    o.text ? `«${o.text}»` : '',
  ];
  return bits.filter(Boolean).join(' · ');
}
