import type { Environment } from '../api/types';
import { factory } from './factory';
import overrides from './overrides.json';
import { spaceBattle } from './spaceBattle';
import { spaceship } from './spaceship';
import { town } from './town';
import type { ThemePack } from './types';
import { warehouse } from './warehouse';

export const THEMES: ThemePack[] = [town, spaceship, warehouse, factory, spaceBattle];
export const DEFAULT_THEME = town;

export function themeById(id: string | null | undefined): ThemePack | undefined {
  return THEMES.find((t) => t.id === id);
}

export type ThemeSource = 'manual' | 'scenario' | 'override' | 'heuristic' | 'default';

export interface ThemeInput {
  /** Theme picked by hand in the UI ('auto' or null means none). */
  manual?: string | null;
  scenarioName?: string;
  scenarioDescription?: string;
  env?: Environment | null;
  overrideMap?: Record<string, string>;
}

/**
 * Picks a theme by priority: manual choice > `environment.global_state.ui_theme`
 * in the scenario YAML > overrides.json (by scenario name) > keyword heuristic.
 */
export function resolveTheme(input: ThemeInput): { theme: ThemePack; source: ThemeSource } {
  const manual = themeById(input.manual);
  if (manual) return { theme: manual, source: 'manual' };

  const fromYaml = themeById(String(input.env?.global_state?.ui_theme ?? ''));
  if (fromYaml) return { theme: fromYaml, source: 'scenario' };

  const map = input.overrideMap ?? (overrides as Record<string, string>);
  const fromOverride = input.scenarioName ? themeById(map[input.scenarioName]) : undefined;
  if (fromOverride) return { theme: fromOverride, source: 'override' };

  const guessed = guessTheme(themeCorpus(input));
  if (guessed) return { theme: guessed, source: 'heuristic' };
  return { theme: DEFAULT_THEME, source: 'default' };
}

export function themeCorpus(input: ThemeInput): string {
  const parts = [input.scenarioName ?? '', input.scenarioDescription ?? ''];
  for (const loc of Object.values(input.env?.locations ?? {})) {
    parts.push(loc.name, loc.type, String(loc.properties?.description ?? ''));
  }
  parts.push(...Object.keys(input.env?.global_state ?? {}));
  return parts.join(' \n ');
}

/** Scores each theme by keyword hits; needs at least two hits to win. */
export function guessTheme(corpus: string): ThemePack | null {
  let best: ThemePack | null = null;
  let bestScore = 1;
  for (const theme of THEMES) {
    const score = theme.keywords.reduce((n, re) => n + (corpus.match(re)?.length ?? 0), 0);
    if (score > bestScore) {
      best = theme;
      bestScore = score;
    }
  }
  return best;
}
