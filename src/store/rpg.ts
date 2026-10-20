// Role-playing rules as the UI shows them: attribute and skill names, a feed line for each
// d20 roll and each level up.

export const ATTRIBUTES: Array<[string, string, string]> = [
  ['strength', 'FUE', 'Fuerza'],
  ['dexterity', 'DES', 'Destreza'],
  ['constitution', 'CON', 'Constitución'],
  ['intelligence', 'INT', 'Inteligencia'],
  ['wisdom', 'SAB', 'Sabiduría'],
  ['charisma', 'CAR', 'Carisma'],
];

export const SKILLS: Record<string, string> = {
  athletics: 'Atletismo',
  intimidation: 'Intimidación',
  stealth: 'Sigilo',
  sleight_of_hand: 'Juego de manos',
  medicine: 'Medicina',
  perception: 'Percepción',
  insight: 'Perspicacia',
  investigation: 'Investigación',
  persuasion: 'Persuasión',
  deception: 'Engaño',
};

/** The attribute each skill is rolled with (as in Simcore). */
export const SKILL_ATTRIBUTE: Record<string, string> = {
  athletics: 'strength',
  intimidation: 'strength',
  stealth: 'dexterity',
  sleight_of_hand: 'dexterity',
  medicine: 'wisdom',
  perception: 'wisdom',
  insight: 'wisdom',
  investigation: 'intelligence',
  persuasion: 'charisma',
  deception: 'charisma',
};

/** XP needed for each level (index = level − 1). */
export const LEVELS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000];

export const modifier = (value: number) => Math.floor((value - 10) / 2);
export const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
export const attrShort = (a: string) => ATTRIBUTES.find(([k]) => k === a)?.[1] ?? a;

export interface DiceRoll {
  agent: string;
  check: string;
  attribute: string;
  skill?: string;
  roll: number;
  modifier: number;
  total: number;
  dc?: number;
  against?: { agent: string; attribute: string; skill?: string; roll: number; total: number };
  success: boolean;
  critical: boolean;
  fumble: boolean;
  target?: string;
  tick?: number;
}

export interface RpgSheet {
  level: number;
  xp: number;
  next: number | null;
  attributes: Record<string, number>;
  skills: string[];
  proficiency: number;
}

const VERBS: Record<string, [string, string, string]> = {
  // check: [what it tries, success, failure]
  attack: ['ataca a', '¡acierta!', 'falla'],
  heal: ['cura a', 'lo consigue', 'no del todo'],
  persuade: ['intenta convencer a', 'lo convence', 'no lo convence'],
  deceive: ['engaña a', 'se lo cree', 'lo pilla mintiendo'],
  intimidate: ['intimida a', 'lo amedrenta', 'no se deja asustar'],
  track: ['busca rastros de', 'encuentra una pista', 'no ve nada'],
};

/** «ataca a Bob: 14 + 4 = 18 contra 13 — ¡acierta!» (the agent is shown apart). */
export function diceText(d: DiceRoll): string {
  const [verb, ok, ko] = VERBS[d.check] ?? [d.check ? (d.target ? `${d.check.replace(/_/g, ' ')} a` : d.check.replace(/_/g, ' ')) : 'tira', 'lo consigue', 'falla'];
  const who = d.target ? ` ${d.target}` : '';
  const sum = d.modifier ? `${d.roll} ${d.modifier > 0 ? '+' : '−'} ${Math.abs(d.modifier)} = ${d.total}` : `${d.total}`;
  const versus = d.against ? `${d.against.total} (${d.against.agent})` : `${d.dc ?? 10}`;
  const verdict = d.critical ? `💥 ¡crítico! ${ok}` : d.fumble ? `💀 ¡pifia! ${ko}` : d.success ? ok : ko;
  const self = d.check === 'heal' && !d.target ? 'se cura' : `${verb}${who}`;
  return `${self}: ${sum} contra ${versus} — ${verdict}`;
}

export interface LevelUp {
  agent: string;
  level: number;
  improved?: { attribute?: string; skill?: string };
}

export function levelText(d: LevelUp): string {
  const better = [
    d.improved?.attribute ? `${attrShort(d.improved.attribute)} +1` : '',
    d.improved?.skill ? `aprende ${SKILLS[d.improved.skill] ?? d.improved.skill}` : '',
  ].filter(Boolean);
  return `sube a nivel ${d.level}${better.length ? ` (${better.join(', ')})` : ''}`;
}

/** Progress inside the current level, 0..1. */
export function xpProgress(s: RpgSheet): number {
  const from = LEVELS[s.level - 1] ?? 0;
  if (!s.next) return 1;
  return Math.max(0, Math.min(1, (s.xp - from) / (s.next - from)));
}

/**
 * A plausible sheet from the personality and profession, like Simcore derives one when the YAML
 * gives none (the editor uses it to fill the sliders; Simcore's own derivation may differ a bit).
 */
export function deriveAttributes(personality: Record<string, number> | undefined, profession = ''): Record<string, number> {
  const p = { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5, ...(personality ?? {}) };
  const a: Record<string, number> = {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10 + Math.round((p.openness - 0.5) * 8),
    wisdom: 10 + Math.round((p.conscientiousness - 0.5) * 6 - (p.neuroticism - 0.5) * 4),
    charisma: 10 + Math.round((p.extraversion - 0.5) * 6 + (p.agreeableness - 0.5) * 2),
  };
  const job = profession.toLowerCase();
  const boost = (keys: string[], attrs: string[], by = 3) => {
    if (keys.some((k) => job.includes(k))) for (const x of attrs) a[x] += by;
  };
  boost(['guardia', 'soldad', 'polic', 'cazador', 'guard', 'soldier', 'hunter'], ['strength', 'dexterity']);
  boost(['médic', 'medic', 'doctor', 'enfermer', 'nurse', 'sacerdote', 'priest', 'veterinari'], ['wisdom']);
  boost(['estudiante', 'científic', 'ingenier', 'student', 'scientist', 'engineer', 'radio'], ['intelligence']);
  boost(['tender', 'taberner', 'pensión', 'alcald', 'shop', 'innkeeper', 'mayor'], ['charisma']);
  boost(['granjer', 'jornaler', 'obrer', 'farmer', 'worker'], ['strength', 'constitution'], 2);
  for (const k of Object.keys(a)) a[k] = Math.max(3, Math.min(18, a[k]));
  return a;
}
