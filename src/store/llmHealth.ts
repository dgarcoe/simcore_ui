/**
 * How much of what the LLM decides is usable: every decision is classified from its reasoning
 * (failed call, unreadable answer, refused by Simcore and why, or useful), so it works live and on
 * saved runs alike.
 */

export type DecisionClass = 'rules' | 'failed' | 'invalid' | 'refused' | 'ok';
export type RefusalReason = 'absent' | 'item' | 'place' | 'not_allowed' | 'invented' | 'other';

export interface Classified {
  kind: DecisionClass;
  reason?: RefusalReason;
  /** The refusal or error in a few words. */
  detail?: string;
}

const LLM_ERROR = /^(LLM error|LLM failed after \d+ attempts):\s*/;
const PARSE_ERROR = /^Parse error:\s*/;
const INVENTED = /is not a valid action/;
const REFUSED = /^(Couldn't .+?|Could not move to .+?|Target not present at this location)(?::\s*|$)/;
// Agents moved by rules (a horde): "<condition>: goes for Ana", "…: roams".
const RULES = /(?:^|\. )[\p{L}\w-]+: (goes for |drawn to where people are|roams|lingers)/u;

const REASONS: Array<[RefusalReason, RegExp]> = [
  ['absent', /is not here|not present|nobody|is not here any more/],
  ['item', /there is no|say which item|don't have|no longer has|has no use|I need \d/],
  ['place', /has to be done at|Could not move|access|closed|only for/],
  ['not_allowed', /not able to|can't be done to/],
];

export const REASON_LABEL: Record<RefusalReason, string> = {
  absent: 'Nombra a alguien que no está allí',
  item: 'Pide o usa un objeto que no tiene o que no hay',
  place: 'Va a un lugar cerrado o actúa en el sitio equivocado',
  not_allowed: 'Elige una acción que su personaje no puede hacer',
  invented: 'Se inventa una acción que no existe',
  other: 'Otros rechazos',
};

const REASON_TIP: Record<RefusalReason, string> = {
  absent: 'El modelo no sigue bien quién está en cada sitio: suele mejorar con un modelo más grande o con menos agentes por lugar.',
  item: 'El modelo pide objetos que no lleva o que no están: revisa que el escenario los describa bien («Item guide») y que estén repartidos; un modelo más grande lee mejor el inventario.',
  place: 'El modelo intenta ir a lugares restringidos o actuar lejos de donde toca: describe mejor dónde se hace cada acción (`where`) y quién puede entrar.',
  not_allowed: 'El modelo elige acciones que su personaje no puede hacer: revisa las descripciones de las acciones del escenario y quién puede hacerlas.',
  invented: 'El modelo se inventa acciones: da a las acciones del escenario nombres y descripciones claras, o usa un modelo que siga mejor las instrucciones.',
  other: 'Mira los ejemplos para ver qué le falla al modelo.',
};

export function classifyDecision(reasoning: string): Classified {
  const r = reasoning.trim();
  if (RULES.test(r)) return { kind: 'rules' };
  if (LLM_ERROR.test(r)) return { kind: 'failed', detail: r.replace(LLM_ERROR, '') };
  if (PARSE_ERROR.test(r)) {
    const detail = r.replace(PARSE_ERROR, '');
    return INVENTED.test(detail) ? { kind: 'refused', reason: 'invented', detail } : { kind: 'invalid', detail };
  }
  const m = REFUSED.exec(r);
  if (!m) return { kind: 'ok' };
  const why = r.slice(m[0].length).split('. ')[0];
  const reason = REASONS.find(([, re]) => re.test(`${m[1]} ${why}`))?.[0] ?? 'other';
  return { kind: 'refused', reason, detail: `${m[1].replace(/:$/, '')}${why ? `: ${why}` : ''}` };
}

export interface LlmHealth {
  ok: number;
  refused: number;
  invalid: number;
  failed: number;
  reasons: Partial<Record<RefusalReason, { count: number; example: string; agent: string; tick: number }>>;
  /** Decisions that weren't usable, by agent. */
  badBy: Record<string, number>;
  /** The tick being counted, and the last finished ticks (oldest first). */
  current: { tick: number; ok: number; bad: number };
  recent: Array<{ tick: number; ok: number; bad: number }>;
}

export const HEALTH_WINDOW = 10;

export function initialHealth(): LlmHealth {
  return { ok: 0, refused: 0, invalid: 0, failed: 0, reasons: {}, badBy: {}, current: { tick: -1, ok: 0, bad: 0 }, recent: [] };
}

export function addDecision(h: LlmHealth, reasoning: string, agent: string, tick: number): LlmHealth {
  const c = classifyDecision(reasoning);
  if (c.kind === 'rules') return h;
  const good = c.kind === 'ok';
  const roll = h.current.tick === tick || h.current.tick < 0 ? h : closeTick(h);
  const current = { tick, ok: roll.current.ok + (good ? 1 : 0), bad: roll.current.bad + (good ? 0 : 1) };
  const next: LlmHealth = { ...roll, [c.kind]: roll[c.kind] + 1, current };
  if (good) return next;
  next.badBy = { ...roll.badBy, [agent]: (roll.badBy[agent] ?? 0) + 1 };
  if (c.reason) {
    const was = roll.reasons[c.reason];
    next.reasons = { ...roll.reasons, [c.reason]: { count: (was?.count ?? 0) + 1, example: c.detail ?? '', agent, tick } };
  }
  return next;
}

/** Ends the tick being counted (a new tick started, or the tick finished). */
export function closeTick(h: LlmHealth): LlmHealth {
  if (h.current.tick < 0 || h.current.ok + h.current.bad === 0) return h;
  return { ...h, recent: [...h.recent, h.current].slice(-HEALTH_WINDOW), current: { tick: -1, ok: 0, bad: 0 } };
}

export function decisions(h: LlmHealth): number {
  return h.ok + h.refused + h.invalid + h.failed;
}

/** Share of usable decisions, 0..100 (null before any). */
export function usefulPct(h: LlmHealth): number | null {
  const n = decisions(h);
  return n ? Math.round((h.ok / n) * 100) : null;
}

export function topReasons(h: LlmHealth): Array<[RefusalReason, { count: number; example: string; agent: string; tick: number }]> {
  return (Object.entries(h.reasons) as Array<[RefusalReason, { count: number; example: string; agent: string; tick: number }]>).sort((a, b) => b[1].count - a[1].count);
}

/** What to do about it, from what dominates; `parseHint` and `errorHint` come from the chip. */
export function healthAdvice(h: LlmHealth, model: string, errorHint: string, parseHint: string): string[] {
  const n = decisions(h);
  if (!n) return [];
  const out: string[] = [];
  if (h.failed / n >= 0.1) out.push(errorHint);
  if (h.invalid / n >= 0.15) out.push(parseHint);
  if (h.refused / n >= 0.25) {
    const [top] = topReasons(h);
    if (top) out.push(REASON_TIP[top[0]]);
  }
  if (!out.length) out.push((usefulPct(h) ?? 100) >= 80 ? 'El modelo va bien: la mayoría de sus decisiones se pueden llevar a cabo.' : 'Algunas decisiones no sirven; mira los motivos de abajo.');
  const size = /[:\-_](\d+(?:\.\d+)?)b\b/i.exec(model);
  if (size && Number(size[1]) < 5 && (usefulPct(h) ?? 100) < 80)
    out.push(`${model.replace(/^ollama\//, '')} es un modelo pequeño: para partidas de demostración, mejor uno de 7B o más (p. ej. ollama/qwen2.5:7b).`);
  return out;
}
