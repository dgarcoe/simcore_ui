// End-of-run awards and highlights (Simcore's simulation_end), worded for people.

export interface Award {
  key: string;
  agent: string;
  value: number;
}

export interface Highlight {
  tick: number;
  kind: string;
  importance: number;
  [k: string]: unknown;
}

/** Title, icon and how the count reads. */
export const AWARDS: Record<string, { title: string; icon: string; what: (n: number) => string }> = {
  knockouts: { title: 'El Martillo', icon: '🔨', what: (n) => `${n} ${n === 1 ? 'rival tumbado' : 'rivales tumbados'}` },
  brawler: { title: 'Puños de Acero', icon: '🥊', what: (n) => `${n} golpes que entraron` },
  punching_bag: { title: 'El Saco de Boxeo', icon: '🩹', what: (n) => `${n} ${n === 1 ? 'vez' : 'veces'} K.O.` },
  thief: { title: 'Manos Largas', icon: '🧤', what: (n) => `${n} ${n === 1 ? 'robo' : 'robos'}` },
  talker: { title: 'El Pico de Oro', icon: '🗣', what: (n) => `${n} conversaciones` },
  wanderer: { title: 'El Trotamundos', icon: '🧭', what: (n) => `${n} lugares pisados` },
  lucky: { title: 'La Flor en el Culo', icon: '🍀', what: (n) => `${n} ${n === 1 ? 'crítico' : 'críticos'}` },
  unlucky: { title: 'El Gafe', icon: '🐈‍⬛', what: (n) => `${n} ${n === 1 ? 'pifia' : 'pifias'}` },
  turncoat: { title: 'El Chaquetero', icon: '🔄', what: (n) => `${n} cambios de bando` },
  tempted: { title: 'Le Pudo la Tentación', icon: '😈', what: (n) => `su línea roja le frenó ${n} ${n === 1 ? 'vez' : 'veces'}` },
  schemer: { title: 'El Estratega', icon: '♟', what: (n) => `${n} ${n === 1 ? 'plan activado' : 'planes activados'}` },
  pacifist: { title: 'El Pacifista', icon: '🕊', what: () => 'no levantó la mano a nadie' },
  untouchable: { title: 'El Intocable', icon: '🛡', what: () => 'nadie le puso la mano encima' },
  magnate: { title: 'El Magnate', icon: '💰', what: (n) => `acabó con ${n} de dinero` },
  tycoon: { title: 'El Tiburón', icon: '🦈', what: (n) => `ganó ${n} vendiendo en los mercados` },
};

export function awardTitle(a: Award): { title: string; icon: string; detail: string } {
  const def = AWARDS[a.key];
  if (!def) return { title: a.key, icon: '🏅', detail: a.value ? String(a.value) : '' };
  return { title: def.title, icon: def.icon, detail: def.what(a.value) };
}

const s = (v: unknown) => String(v ?? '').trim();

/** «t14 · Tumba a Grasa con el bate». */
export function highlightText(h: Highlight): string {
  const target = s(h.target);
  switch (h.kind) {
    case 'killed':
      return `Mata a ${target}${h.weapon ? ` con ${s(h.weapon)}` : ''}`;
    case 'knocked_out':
      return `Deja K.O. a ${target}${h.weapon ? ` con ${s(h.weapon)}` : ''}`;
    case 'was_knocked_out':
      return `Le dejan K.O.${h.cause ? ` (${s(h.cause)})` : ''}`;
    case 'died':
      return `Muere${h.cause ? ` (${s(h.cause)})` : ''}`;
    case 'critical':
      return `¡Crítico! ${s(h.check).replace(/_/g, ' ')}${target ? ` contra ${target}` : ''}`;
    case 'fumble':
      return `¡Pifia! ${s(h.check).replace(/_/g, ' ')}${target ? ` contra ${target}` : ''}`;
    case 'stole':
      return `Le roba ${s(h.item)} a ${target}`;
    case 'holder':
      return `Se hace con ${s(h.item)}`;
    case 'group':
      return (
        {
          left: `Deja ${s(h.group)}`,
          joined: `Se une a ${s(h.group)}`,
          founded: `Funda ${s(h.group)}`,
          expelled: `Le echan de ${s(h.group)}`,
          leader: `Pasa a liderar ${s(h.group)}`,
        }[s(h.change)] ?? `${s(h.change)} ${s(h.group)}`
      );
    case 'plan':
      return `Se activa su plan: «${s(h.text)}»`;
    case 'points': {
      const p = Number(h.points ?? 0);
      return `${p > 0 ? '+' : ''}${p} puntos: ${s(h.description)}`;
    }
    case 'transformed':
      return `Se convierte en ${s(h.into)}`;
    case 'custom':
      return s(h.text) || s(h.name).replace(/_/g, ' ');
    case 'deal':
      return `Vende ${s(h.amount)} ${s(h.item)} por ${s(h.price)} ${s(h.currency)} en ${s(h.place)}`;
    default:
      return h.kind;
  }
}

/** Text to share a player's result. */
export function shareText(opts: {
  game: string;
  agent: string;
  rank?: number;
  players?: number;
  points?: number;
  winner?: string;
  awards: Award[];
  highlights: Highlight[];
}): string {
  const mine = opts.awards.filter((a) => a.agent === opts.agent).map((a) => `${awardTitle(a).icon} ${awardTitle(a).title}`);
  return [
    `◆ ${opts.game} — ${opts.agent}`,
    opts.rank ? `Puesto ${opts.rank} de ${opts.players} · ${opts.points} puntos` : '',
    opts.winner ? `Ganó: ${opts.winner}` : '',
    mine.length ? `Premios: ${mine.join(' · ')}` : '',
    ...opts.highlights.map((h) => `· t${h.tick} ${highlightText(h)}`),
  ]
    .filter(Boolean)
    .join('\n');
}
