import { useSim } from '../store/simStore';

/** What a scenario calls its groups and the places they fight over (gangs and turf, crews and
 * sectors, houses and lands…): `environment.global_state.ui_words`. */
export interface Words {
  group: string;
  groups: string;
  territory: string;
  territories: string;
}

export const DEFAULT_WORDS: Words = { group: 'grupo', groups: 'grupos', territory: 'territorio', territories: 'territorios' };

export function wordsOf(raw: unknown): Words {
  const w = raw && typeof raw === 'object' ? (raw as Partial<Record<keyof Words, unknown>>) : {};
  const pick = (k: keyof Words) => (typeof w[k] === 'string' && (w[k] as string).trim() ? (w[k] as string).trim() : DEFAULT_WORDS[k]);
  const group = pick('group');
  const territory = pick('territory');
  const plural = (s: string) => {
    if (/[aeiouáéíóú]$/i.test(s)) return `${s}s`;
    // tripulación → tripulaciones: the accent goes away when the word grows
    const m = /([áéíóú])([ns])$/i.exec(s);
    if (m) return `${s.slice(0, -2)}${m[1].normalize('NFD')[0]}${m[2]}es`;
    return `${s}es`;
  };
  return {
    group,
    groups: typeof w.groups === 'string' && w.groups.trim() ? w.groups.trim() : group === DEFAULT_WORDS.group ? DEFAULT_WORDS.groups : plural(group),
    territory,
    territories:
      typeof w.territories === 'string' && w.territories.trim() ? w.territories.trim() : territory === DEFAULT_WORDS.territory ? DEFAULT_WORDS.territories : plural(territory),
  };
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

let playerWords: Words | null = null;

/** The player's page has no simulation: its words come with the game. */
export function setPlayerWords(raw: unknown): void {
  playerWords = raw ? wordsOf(raw) : null;
}

/** The running or replayed scenario's words (or the player's game's). */
export function useWords(): Words {
  const cfg = useSim((s) => s.scenarioConfig?.environment?.global_state?.ui_words);
  const env = useSim((s) => s.sim?.environment?.global_state?.ui_words);
  return playerWords ?? wordsOf(cfg ?? env);
}
