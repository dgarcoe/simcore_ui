import { P } from '../../themes/palette';
import type { ThemePack } from '../../themes/types';
import { hashString } from '../map/rng';
import { drawPixels, overlay, shade, type Slots } from './pixel';
import { agentFrames, HEADGEAR } from './sprites';

/** Deterministic colors and headgear for an agent, so it looks the same everywhere. */
export function agentLook(theme: ThemePack, name: string): { slots: Slots; gear: string | null; shirt: string } {
  const h = hashString(name);
  const pick = <T,>(arr: T[], salt: number): T => arr[(h >>> salt) % arr.length];
  const shirt = pick(theme.agent.outfits, 0);
  return {
    shirt,
    gear: pick(theme.agent.headgear, 15),
    slots: {
      o: P.ink,
      h: pick(theme.agent.hair, 3),
      s: pick(theme.agent.skin, 7),
      e: P.ink,
      c: shirt,
      C: shade(shirt, -0.3),
      p: pick(theme.agent.pants, 11),
      b: P.ink,
      y: theme.agent.headgearColor,
      m: theme.agent.headgearColor,
      v: P.cyan,
    },
  };
}

/** Draws the front-facing idle frame (used for UI portraits). */
export function drawPortrait(ctx: CanvasRenderingContext2D, theme: ThemePack, name: string, scale: number): void {
  const { slots, gear } = agentLook(theme, name);
  const rows = agentFrames('down')[0];
  drawPixels(ctx, gear ? overlay(rows, HEADGEAR[gear]?.down) : rows, slots, 0, 0, { scale });
}
