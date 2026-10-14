// Static render of a generated map (no Phaser) for the scenario editor.

import type { ScenarioConfig } from '../../api/scenario';
import { P } from '../../themes/palette';
import type { ThemePack } from '../../themes/types';
import type { MapModel } from '../map/model';
import { drawPortrait } from './agentLook';
import { paintMap, TILE } from './paintMap';
import { drawPixels } from './pixel';
import { propSprite } from './propSprite';
import { PROPS } from './sprites';

export function renderPreview(map: MapModel, theme: ThemePack, cfg: ScenarioConfig): HTMLCanvasElement {
  const canvas = paintMap(map, theme);
  const ctx = canvas.getContext('2d')!;
  if (theme.ambient === 'stars') drawStars(ctx, map);

  const props = [...map.props].sort((a, b) => a.y - b.y);
  for (const p of props) {
    const rows = PROPS[propSprite(theme, p.key)];
    if (rows) drawPixels(ctx, rows, theme.propColors, p.x * TILE, p.y * TILE);
  }

  // Agents at their starting zones, in the same spots the live view uses.
  const used = new Map<string, number>();
  for (const a of cfg.agents) {
    const zone = map.zones.find((z) => z.name === a.starting_location) ?? map.zones[0];
    if (!zone || !a.name) continue;
    const i = used.get(zone.name) ?? 0;
    used.set(zone.name, i + 1);
    const spot = zone.spots[i % zone.spots.length];
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(spot.x * TILE + 2, spot.y * TILE + 13, 12, 3);
    drawPortrait(ctx, theme, a.name, 1, a.profession, spot.x * TILE, spot.y * TILE);
  }

  ctx.font = '8px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (const z of map.zones) {
    const x = z.label.x * TILE + (z.body.w % 2 ? TILE / 2 : 0);
    const y = z.label.y * TILE + TILE - 2;
    const w = ctx.measureText(z.name).width + 6;
    ctx.fillStyle = theme.ui.labelBg;
    ctx.fillRect(Math.round(x - w / 2), y - 12, Math.ceil(w), 12);
    ctx.fillStyle = theme.ui.label;
    ctx.fillText(z.name, x, y - 1);
  }
  return canvas;
}

function drawStars(ctx: CanvasRenderingContext2D, map: MapModel): void {
  // Behind everything: only paint where the map left empty space.
  ctx.globalCompositeOperation = 'destination-over';
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < (map.cols * map.rows) / 2; i++) {
    ctx.fillStyle = rnd() > 0.85 ? P.white : P.slate;
    ctx.fillRect(Math.floor(rnd() * map.cols * TILE), Math.floor(rnd() * map.rows * TILE), 1, 1);
  }
  ctx.fillStyle = '#070812';
  ctx.fillRect(0, 0, map.cols * TILE, map.rows * TILE);
  ctx.globalCompositeOperation = 'source-over';
}
