import { P } from '../../themes/palette';
import type { ThemePack } from '../../themes/types';
import { hashString } from '../map/rng';
import { drawPixels, overlay, shade, type Slots } from './pixel';
import { archetypeFor } from './archetypes';
import { agentFrames, HEADGEAR } from './sprites';

/**
 * Deterministic colors and headgear for an agent, so it looks the same
 * everywhere. A known profession dresses the agent for the job.
 */
export function agentLook(
  theme: ThemePack,
  name: string,
  profession?: string,
): { slots: Slots; gear: string | null; shirt: string; key: string } {
  const h = hashString(name);
  const pick = <T,>(arr: T[], salt: number): T => arr[(h >>> salt) % arr.length];
  const arch = archetypeFor(profession);
  const shirt = arch?.shirt ?? pick(theme.agent.outfits, 0);
  const gear = arch && arch.headgear !== undefined ? arch.headgear : pick(theme.agent.headgear, 15);
  const gearColor = arch?.gearColor ?? theme.agent.headgearColor;
  return {
    shirt,
    gear,
    key: arch?.id ?? 'default',
    slots: {
      o: P.ink,
      h: pick(theme.agent.hair, 3),
      s: pick(theme.agent.skin, 7),
      e: P.ink,
      c: shirt,
      C: shade(shirt, -0.3),
      p: arch?.pants ?? pick(theme.agent.pants, 11),
      b: P.ink,
      y: gearColor,
      m: gearColor,
      v: P.cyan,
    },
  };
}

/** Draws the front-facing idle frame (used for UI portraits). */
export function drawPortrait(
  ctx: CanvasRenderingContext2D,
  theme: ThemePack,
  name: string,
  scale: number,
  profession?: string,
  ox = 0,
  oy = 0,
): void {
  const { slots, gear } = agentLook(theme, name, profession);
  const rows = agentFrames('down')[0];
  drawPixels(ctx, gear ? overlay(rows, HEADGEAR[gear]?.down) : rows, slots, ox, oy, { scale });
}
