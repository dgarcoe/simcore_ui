// Who downed whom: knockouts and deaths with who did it and how, collapses from exhaustion and
// turns spent recovering. Built event by event (live and in replays).

import type { SimEvent } from '../api/types';

export interface PersonTally {
  /** Rivals they knocked out or killed. */
  downed: number;
  /** Times they were knocked out. */
  fell: number;
  deaths: number;
  /** Times they collapsed from exhaustion. */
  exhausted: number;
  /** Turns spent recovering (hospital or bed). */
  hospital: number;
}

export interface Casualties {
  people: Record<string, PersonTally>;
  /** "by\u0000victim" → times. */
  pairs: Record<string, number>;
  /** cause (a weapon, «puñetazos», «explosión», «agotamiento»…) → times. */
  causes: Record<string, number>;
}

export const emptyCasualties = (): Casualties => ({ people: {}, pairs: {}, causes: {} });

const HOW: Record<string, string> = {
  fuse: 'explosión',
  condition: 'enfermedad o estado',
  needs: 'necesidades',
  hazard: 'peligro del lugar',
  event: 'suceso',
  action: 'acción de otro',
};

const blank = (): PersonTally => ({ downed: 0, fell: 0, deaths: 0, exhausted: 0, hospital: 0 });

/** Who did it and with what, also from older recordings that only have "Toro with the bate". */
function culprit(d: Record<string, unknown>): { by: string; cause: string } {
  const by = String(d.by ?? '');
  const how = String(d.how ?? '');
  const weapon = String(d.weapon ?? '');
  if (by || how) return { by, cause: how === 'attack' || (!how && by) ? weapon || 'puñetazos' : HOW[how] ?? (how || 'otra causa') };
  const raw = String(d.cause ?? '');
  const m = /^(.+?) with the (.+)$/.exec(raw);
  if (m) return { by: m[1], cause: m[2] };
  if (/went off/.test(raw)) return { by: '', cause: 'explosión' };
  return { by: '', cause: raw ? 'otra causa' : 'desconocida' };
}

export function tallyCasualties(c: Casualties, e: SimEvent): Casualties {
  const d = (e.data ?? {}) as Record<string, unknown>;
  const touch = (name: string, f: (p: PersonTally) => void, next: Casualties) => {
    if (!name) return;
    const p = { ...(next.people[name] ?? blank()) };
    f(p);
    next.people = { ...next.people, [name]: p };
  };
  if (e.type === 'agent_knockout' || e.type === 'agent_death') {
    const victim = String(d.agent ?? e.source ?? '');
    const { by, cause } = culprit(d);
    const next: Casualties = { ...c, causes: { ...c.causes, [cause]: (c.causes[cause] ?? 0) + 1 } };
    touch(victim, (p) => (e.type === 'agent_death' ? p.deaths++ : p.fell++), next);
    if (by && by !== victim) {
      touch(by, (p) => p.downed++, next);
      const key = `${by}\u0000${victim}`;
      next.pairs = { ...next.pairs, [key]: (next.pairs[key] ?? 0) + 1 };
    }
    return next;
  }
  if (e.type === 'agent_action' && (d.exhausted || d.recovering)) {
    const next: Casualties = { ...c };
    if (d.exhausted) next.causes = { ...c.causes, agotamiento: (c.causes.agotamiento ?? 0) + 1 };
    touch(e.source, (p) => (d.exhausted ? p.exhausted++ : p.hospital++), next);
    return next;
  }
  return c;
}

export interface Rivalry {
  by: string;
  victim: string;
  times: number;
}

export function rivalries(c: Casualties): Rivalry[] {
  return Object.entries(c.pairs)
    .map(([k, times]) => {
      const [by, victim] = k.split('\u0000');
      return { by, victim, times };
    })
    .sort((a, b) => b.times - a.times || a.by.localeCompare(b.by));
}

/** Per group: downed (by its members) and suffered (knockouts + deaths of its members). */
export function groupCasualties(c: Casualties, factions: Record<string, { members?: string[]; color?: string }>) {
  return Object.entries(factions)
    .map(([group, f]) => {
      const members = f.members ?? [];
      const sum = (k: keyof PersonTally) => members.reduce((n, m) => n + (c.people[m]?.[k] ?? 0), 0);
      return { group, color: f.color ?? '', downed: sum('downed'), suffered: sum('fell') + sum('deaths'), hospital: sum('hospital') };
    })
    .sort((a, b) => b.downed - a.downed || a.suffered - b.suffered);
}
