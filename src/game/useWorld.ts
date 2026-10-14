import { useMemo } from 'react';
import { mapHints } from '../api/scenario';
import type { Environment } from '../api/types';
import { useSim } from '../store/simStore';
import { resolveTheme } from '../themes/registry';
import { generateMap } from './map/model';

/** Stable string that only changes when the map itself would change. */
function envSignature(env: Environment | undefined): string {
  if (!env) return '';
  return Object.values(env.locations)
    .map((l) => `${l.name}|${l.type}|${l.position?.join(',')}|${l.capacity}|${l.virtual}|${String(l.properties?.ui_role ?? '')}`)
    .sort()
    .join(';') + `#${String(env.global_state?.ui_theme ?? '')}`;
}

export function useWorld() {
  const sim = useSim((s) => s.sim);
  const scenarioName = useSim((s) => s.scenarioName);
  const scenarioDescription = useSim((s) => s.scenarioDescription);
  const themeChoice = useSim((s) => s.themeChoice);
  const config = useSim((s) => s.scenarioConfig);
  const sig = envSignature(sim?.environment);
  const env = sig ? sim!.environment : null;

  const resolved = useMemo(
    () => resolveTheme({ manual: themeChoice === 'auto' ? null : themeChoice, scenarioName, scenarioDescription, env }),
    // env is tracked through its signature
    [sig, themeChoice, scenarioName, scenarioDescription],
  );
  const detected = useMemo(
    () => resolveTheme({ scenarioName, scenarioDescription, env }),
    [sig, scenarioName, scenarioDescription],
  );
  const map = useMemo(
    () => (env ? generateMap(env, resolved.theme.layout, scenarioName || sig, mapHints(config)) : null),
    [sig, resolved.theme.layout, scenarioName, config],
  );
  return { theme: resolved.theme, source: resolved.source, detected, map };
}
