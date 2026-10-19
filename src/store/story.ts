// The story of a run, as the UI tells it: key moments picked from the events (the same rules
// Simcore uses, so older replays get a timeline too), the chronicle's chapters, how
// relationships looked at each tick, and a downloadable account of it all.
import type { SimEvent, SimState } from '../api/types';

export interface Moment {
  tick: number;
  importance: number;
  text: string;
  kind: string;
  agents: string[];
  place: string;
}

export interface Chapter {
  n: number;
  title: string;
  text: string;
  from_tick: number;
  to_tick: number;
}

/** Relationships between agents at one tick. */
export interface RelFrame {
  tick: number;
  /** who → whom → sentiment -1..1 */
  rels: Record<string, Record<string, number>>;
  /** who → whom → brother, rival… */
  kinds: Record<string, Record<string, string>>;
  /** who → alive | dead | departed */
  status: Record<string, string>;
  /** who → location */
  places: Record<string, string>;
}

export const MOMENT_LIMIT = 500;
export const FRAME_LIMIT = 400;
export const STRONG = 0.7;

const str = (v: unknown) => String(v ?? '').trim();

/** How much an event matters to the story (null: not at all). */
export function scoreEvent(e: SimEvent): Moment | null {
  const d = e.data ?? {};
  const place = str(d.location ?? d.place);
  const m = (importance: number, text: string, agents: string[], where = place): Moment => ({
    tick: e.tick,
    importance,
    text,
    kind: e.type,
    agents: agents.filter(Boolean),
    place: where,
  });
  switch (e.type) {
    case 'agent_death': {
      const who = str(d.agent ?? e.source);
      return m(1, `${who} muere${d.cause ? ` (${str(d.cause)})` : ''}`, [who]);
    }
    case 'condition_change':
      if (d.change === 'transformed') return m(0.9, `${str(d.agent)} se convierte en ${str(d.into)}`, [str(d.agent)]);
      if (d.change === 'added' && d.cause) return m(0.4, `${str(d.agent)}: ${str(d.condition)} (${str(d.cause)})`, [str(d.agent)]);
      return null;
    case 'belief_shared':
      if (d.secret) return m(0.8, `${str(d.from)} le revela un secreto a ${str(d.to)}: «${str(d.text)}»`, [str(d.from), str(d.to)]);
      if (!d.from) return m(0.4, `Un rumor llega a ${str(d.to)}: «${str(d.text)}»`, [str(d.to)]);
      if (d.truth === false) return m(0.5, `${str(d.from)} le cuenta algo falso a ${str(d.to)}: «${str(d.text)}»`, [str(d.from), str(d.to)]);
      return null;
    case 'simulation_end':
      return d.message ? m(1, str(d.message), [], '') : null;
    case 'rule_fired': {
      if (!d.description) return null;
      const ends = typeof d.effects === 'object' && d.effects !== null && 'end' in (d.effects as object);
      return m(ends ? 0.9 : 0.7, str(d.description), [], '');
    }
    case 'scheduled_event':
    case 'injected_event':
      return d.description ? m(0.7, str(d.description), []) : null;
    case 'agent_spawn':
      return m(0.5, `Llega ${str(d.agent ?? e.source)}`, [str(d.agent ?? e.source)]);
    case 'agent_depart':
      return m(0.5, `${str(d.agent ?? e.source)} se marcha`, [str(d.agent ?? e.source)]);
    case 'agent_search':
      return d.step === 'found' ? m(0.5, `${str(d.agent)} encuentra a ${str(d.target)}`, [str(d.agent), str(d.target)]) : null;
    case 'place_change':
      return d.cause ? m(0.5, str(d.cause), [], str(d.location)) : null;
    case 'speech_ignored':
      return m(0.3, `${e.source} ignora a ${str(d.agent)}`, [e.source, str(d.agent)]);
    case 'vote_result':
      return m(0.7, `Votación «${str(d.question)}»: ${d.winner ? `gana ${str(d.winner)}` : 'sin decisión'}`, [], str(d.place));
    case 'faction_change':
      if (d.change === 'founded') return m(0.6, `${str(d.agent)} funda el grupo «${str(d.faction)}»`, [str(d.agent)]);
      if (d.change === 'leader') return m(0.6, `${str(d.agent)} pasa a liderar «${str(d.faction)}»`, [str(d.agent)]);
      if (d.change === 'dissolved') return m(0.5, `El grupo «${str(d.faction)}» se disuelve`, []);
      if (d.change === 'rival') return m(0.5, `«${str(d.faction)}» y «${str(d.other)}» se enfrentan`, [str(d.agent)]);
      if (d.change === 'expelled') return m(0.5, `${str(d.agent)} es expulsado de «${str(d.faction)}»`, [str(d.agent)]);
      return null;
    case 'agent_action':
      if (d.action_type === 'attack' && d.hit && !d.killed) return m(0.5, `${e.source} ataca a ${str(d.target)}`, [e.source, str(d.target)]);
      if (d.action_type === 'heal' && d.target) return m(0.4, `${e.source} cura a ${str(d.target)}`, [e.source, str(d.target)]);
      if (d.action_type === 'custom' && d.name && d.success !== false)
        return m(d.target ? 0.5 : 0.35, `${e.source} ${str(d.action)}`, [e.source, str(d.target)]);
      return null;
    default:
      return null;
  }
}

/** Sentiment from Simcore's relationship description, for states without numbers. */
export function toneScore(description: string): number {
  if (/close friend/.test(description)) return 0.7;
  if (/friendly/.test(description)) return 0.3;
  if (/unfriendly/.test(description)) return -0.3;
  if (/hostile/.test(description)) return -0.7;
  return 0;
}

export function relFrame(tick: number, state: SimState): RelFrame {
  const frame: RelFrame = { tick, rels: {}, kinds: {}, status: {}, places: {} };
  for (const a of Object.values(state.agents ?? {})) {
    const scores = a.relationship_scores;
    frame.rels[a.name] = scores
      ? { ...scores }
      : Object.fromEntries(Object.entries(a.relationships ?? {}).map(([k, v]) => [k, toneScore(v)]));
    if (a.relationship_kinds && Object.keys(a.relationship_kinds).length) frame.kinds[a.name] = { ...a.relationship_kinds };
    frame.status[a.name] = a.status ?? a.state?.status ?? 'alive';
    frame.places[a.name] = a.location;
  }
  return frame;
}

/** The latest frame at or before a tick. */
export function frameAt(frames: RelFrame[], tick: number): RelFrame | null {
  let found: RelFrame | null = null;
  for (const f of frames) {
    if (f.tick > tick) break;
    found = f;
  }
  return found ?? frames[0] ?? null;
}

/** Edges for a graph: one per pair, the average of both directions, strongest first. */
export function edgesOf(frame: RelFrame, min = 0.15): Array<{ a: string; b: string; value: number; kind: string }> {
  const seen = new Map<string, { a: string; b: string; sum: number; n: number; kind: string }>();
  for (const [a, row] of Object.entries(frame.rels)) {
    for (const [b, v] of Object.entries(row)) {
      if (!(b in frame.rels) || a === b) continue;
      const key = [a, b].sort().join('\u0000');
      const e = seen.get(key) ?? { a: [a, b].sort()[0], b: [a, b].sort()[1], sum: 0, n: 0, kind: '' };
      e.sum += v;
      e.n += 1;
      e.kind ||= frame.kinds[a]?.[b] ?? '';
      seen.set(key, e);
    }
  }
  return [...seen.values()]
    .map((e) => ({ a: e.a, b: e.b, value: e.sum / e.n, kind: e.kind }))
    .filter((e) => Math.abs(e.value) >= min)
    .sort((x, y) => Math.abs(y.value) - Math.abs(x.value));
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A self-contained HTML account of the run: chapters, key moments, the cast and the ending. */
export function storyHtml(opts: {
  title: string;
  description?: string;
  chapters: Chapter[];
  moments: Moment[];
  cast: Array<{ name: string; status: string; note?: string }>;
  ending?: string;
  epilogue?: string;
}): string {
  const key = opts.moments.filter((m) => m.importance >= 0.5);
  const castLine = (c: { name: string; status: string; note?: string }) =>
    `<li>${esc(c.name)}${c.status === 'dead' ? ' ✝' : c.status === 'departed' ? ' (se fue)' : ''}${c.note ? ` — ${esc(c.note)}` : ''}</li>`;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<style>body{font:17px/1.6 Georgia,serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#222;background:#fbf8f1}
h1{font-size:2rem;margin-bottom:.2rem}h2{margin-top:2rem;font-size:1.25rem}.dim{color:#777}
ol.timeline{padding-left:1.2rem}ol.timeline li{margin:.2rem 0}.tick{color:#999;font-family:monospace;font-size:.85em}
.end{font-style:italic;border-left:3px solid #b13e53;padding-left:.8rem}</style></head><body>
<h1>${esc(opts.title)}</h1>
${opts.description ? `<p class="dim">${esc(opts.description)}</p>` : ''}
${opts.chapters.map((c) => `<h2>${esc(c.title)}</h2><p>${esc(c.text)}</p>`).join('\n')}
${opts.epilogue ? `<h2>Epílogo</h2><p>${esc(opts.epilogue)}</p>` : ''}
${opts.ending ? `<p class="end">${esc(opts.ending)}</p>` : ''}
${key.length ? `<h2>Momentos clave</h2><ol class="timeline">${key.map((m) => `<li><span class="tick">t${m.tick}</span> ${esc(m.text)}</li>`).join('')}</ol>` : ''}
${opts.cast.length ? `<h2>Reparto</h2><ul>${opts.cast.map(castLine).join('')}</ul>` : ''}
</body></html>
`;
}
