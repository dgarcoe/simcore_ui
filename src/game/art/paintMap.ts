// Paints the static part of a map (ground, roads, walls, buildings, hulls)
// into one canvas. Props, agents and labels are separate game objects.

import { P } from '../../themes/palette';
import { buildingFor, floorFor, type FloorStyle, type ThemePack } from '../../themes/types';
import type { Ground, Lot, MapModel, Rect, Street, Zone } from '../map/model';
import { createRng, hashString, type Rng } from '../map/rng';
import type { ZoneRole } from '../map/roles';
import { drawPixels, frame, makeCanvas, rect, shade } from './pixel';

export const TILE = 16;

export function paintMap(map: MapModel, theme: ThemePack): HTMLCanvasElement {
  const canvas = makeCanvas(map.cols * TILE, map.rows * TILE);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const zoneAt = indexZones(map);
  const g = (x: number, y: number): Ground | undefined =>
    x < 0 || y < 0 || x >= map.cols || y >= map.rows ? undefined : map.ground[y * map.cols + x];

  for (let y = 0; y < map.rows; y++)
    for (let x = 0; x < map.cols; x++) {
      const rng = createRng(hashString(`${x},${y}`));
      const px = x * TILE;
      const py = y * TILE;
      const ground = g(x, y)!;
      const zone = zoneAt[y * map.cols + x];
      switch (ground) {
        case 'void':
          if (map.layout !== 'void') paintOutside(ctx, theme, px, py, rng, x, y);
          break;
        case 'ground':
          if (theme.urban) paintPavement(ctx, theme, px, py, rng, x, y);
          else paintGrass(ctx, theme, px, py, rng);
          break;
        case 'path': {
          const road = (dx: number, dy: number) => {
            const n = g(x + dx, y + dy);
            return n === 'path' || n === 'plaza' || n === 'building';
          };
          if (theme.urban) paintRoad(ctx, theme, px, py, rng, road, map.city ? () => false : (dx, dy) => g(x + dx, y + dy) === 'path', x, y);
          else paintPath(ctx, theme, px, py, rng, road);
          break;
        }
        case 'plaza':
          paintFloor(ctx, { pattern: 'tiles', base: theme.plaza.base, alt: theme.plaza.alt }, px, py, x, y, rng);
          break;
        case 'corridor':
          paintCorridor(ctx, theme, px, py, rng, (dx, dy) => g(x + dx, y + dy) === 'wall');
          break;
        case 'wall': {
          const below = g(x, y + 1);
          paintWall(ctx, theme, px, py, below === 'floor' || below === 'corridor' || below === 'door', x);
          break;
        }
        case 'door':
          paintCorridor(ctx, theme, px, py, rng, () => false);
          if (map.layout === 'indoor') paintDoorFrame(ctx, theme, px, py, g(x - 1, y) === 'wall');
          break;
        case 'floor':
          if (map.layout === 'indoor' && zone) paintFloor(ctx, floorFor(theme, zone.role), px, py, x - zone.body.x, y - zone.body.y, rng);
          break;
        case 'lane':
          break; // drawn below so dashes line up along the whole route
        case 'building':
          break; // drawn per zone
      }
    }

  if (map.layout === 'void') {
    for (const link of map.links) paintLane(ctx, theme, link.path);
    for (const z of map.zones) paintHull(ctx, theme, z);
  }
  if (map.city) paintCity(ctx, theme, map);
  if (map.layout === 'outdoor') for (const z of map.zones) paintBuilding(ctx, theme, z);
  return canvas;
}

function indexZones(map: MapModel): Array<Zone | undefined> {
  const out: Array<Zone | undefined> = new Array(map.cols * map.rows);
  for (const z of map.zones)
    for (let y = z.body.y; y < z.body.y + z.body.h; y++) for (let x = z.body.x; x < z.body.x + z.body.w; x++) out[y * map.cols + x] = z;
  return out;
}

// ── Terrain ─────────────────────────────────────────────────────────────

function speckle(ctx: CanvasRenderingContext2D, rng: Rng, color: string, px: number, py: number, n: number, size = 1): void {
  for (let i = 0; i < n; i++) rect(ctx, color, px + Math.floor(rng() * (TILE - size)), py + Math.floor(rng() * (TILE - size)), size, size);
}

function paintGrass(ctx: CanvasRenderingContext2D, theme: ThemePack, px: number, py: number, rng: Rng): void {
  rect(ctx, rng() < 0.5 ? theme.ground.base : theme.ground.alt, px, py, TILE, TILE);
  speckle(ctx, rng, theme.ground.alt, px, py, 6, 2);
  for (let i = 0; i < 3; i++) {
    // little grass blades
    const x = px + 1 + Math.floor(rng() * 13);
    const y = py + 2 + Math.floor(rng() * 12);
    rect(ctx, theme.ground.detail, x, y, 1, 2);
    rect(ctx, theme.ground.detail, x + 2, y + 1, 1, 1);
  }
}

function paintOutside(ctx: CanvasRenderingContext2D, theme: ThemePack, px: number, py: number, rng: Rng, x: number, y: number): void {
  rect(ctx, theme.ground.base, px, py, TILE, TILE);
  // large plating panels every 2x2 tiles
  if (x % 2 === 0) rect(ctx, theme.ground.alt, px, py, 1, TILE);
  if (y % 2 === 0) rect(ctx, theme.ground.alt, px, py, TILE, 1);
  if (x % 2 === 0 && y % 2 === 0) rect(ctx, theme.ground.detail, px + 2, py + 2, 1, 1);
  speckle(ctx, rng, theme.ground.alt, px, py, 2);
}

function paintPath(
  ctx: CanvasRenderingContext2D,
  theme: ThemePack,
  px: number,
  py: number,
  rng: Rng,
  connected: (dx: number, dy: number) => boolean,
): void {
  rect(ctx, theme.path.base, px, py, TILE, TILE);
  speckle(ctx, rng, theme.path.edge, px, py, 5);
  speckle(ctx, rng, shade(theme.path.base, 0.15), px, py, 3);
  // soft grass edge where the road ends
  if (!connected(0, -1)) rect(ctx, theme.path.edge, px, py, TILE, 2);
  if (!connected(0, 1)) rect(ctx, theme.path.edge, px, py + TILE - 2, TILE, 2);
  if (!connected(-1, 0)) rect(ctx, theme.path.edge, px, py, 2, TILE);
  if (!connected(1, 0)) rect(ctx, theme.path.edge, px + TILE - 2, py, 2, TILE);
}

export function paintFloor(ctx: CanvasRenderingContext2D, f: FloorStyle, px: number, py: number, lx: number, ly: number, rng: Rng): void {
  const { base, alt } = f;
  rect(ctx, base, px, py, TILE, TILE);
  switch (f.pattern) {
    case 'tiles':
      rect(ctx, alt, px, py, TILE, 1);
      rect(ctx, alt, px, py, 1, TILE);
      rect(ctx, alt, px + 8, py, 1, TILE);
      rect(ctx, alt, px, py + 8, TILE, 1);
      rect(ctx, shade(base, 0.3), px + 2, py + 2, 2, 1);
      break;
    case 'checker':
      rect(ctx, alt, px + ((lx + ly) % 2) * 8, py, 8, 8);
      rect(ctx, alt, px + (((lx + ly) % 2) ^ 1) * 8, py + 8, 8, 8);
      break;
    case 'planks':
      for (let i = 0; i < 4; i++) {
        rect(ctx, alt, px, py + i * 4 + 3, TILE, 1);
        rect(ctx, alt, px + ((i * 5 + lx * 3) % TILE), py + i * 4, 1, 3);
      }
      break;
    case 'carpet':
      for (let i = 0; i < 10; i++) rect(ctx, alt, px + Math.floor(rng() * TILE), py + Math.floor(rng() * TILE), 1, 1);
      if ((lx + ly) % 2 === 0) rect(ctx, alt, px + 7, py + 7, 2, 2);
      break;
    case 'grate':
      for (let i = 2; i < TILE; i += 4) {
        rect(ctx, alt, px + i, py, 1, TILE);
        rect(ctx, alt, px, py + i, TILE, 1);
      }
      frame(ctx, shade(base, -0.25), px, py, TILE, TILE);
      break;
    case 'concrete':
      speckle(ctx, rng, alt, px, py, 8);
      speckle(ctx, rng, shade(base, 0.12), px, py, 4);
      if (rng() < 0.15) {
        const x = px + 3 + Math.floor(rng() * 9);
        rect(ctx, alt, x, py + 4, 1, 3);
        rect(ctx, alt, x + 1, py + 7, 1, 3);
      }
      break;
    case 'hazard':
      speckle(ctx, rng, shade(base, -0.15), px, py, 6);
      if (ly === 0) for (let i = 0; i < TILE; i += 4) rect(ctx, (i / 4 + lx) % 2 ? alt : P.ink, px + i, py, 4, 3);
      break;
    case 'deck':
      frame(ctx, alt, px, py, TILE, TILE);
      rect(ctx, shade(base, 0.15), px + 1, py + 1, TILE - 2, 1);
      rect(ctx, alt, px + 3, py + 3, 1, 1);
      rect(ctx, alt, px + 12, py + 12, 1, 1);
      break;
    case 'soil':
      for (let i = 1; i < TILE; i += 4) rect(ctx, alt, px, py + i, TILE, 2);
      break;
  }
}

function paintCorridor(
  ctx: CanvasRenderingContext2D,
  theme: ThemePack,
  px: number,
  py: number,
  rng: Rng,
  wallAt: (dx: number, dy: number) => boolean,
): void {
  rect(ctx, theme.path.base, px, py, TILE, TILE);
  speckle(ctx, rng, shade(theme.path.base, -0.12), px, py, 5);
  rect(ctx, shade(theme.path.base, 0.1), px + 7, py + 7, 2, 2);
  // guide lines along the walls
  if (wallAt(0, -1)) rect(ctx, theme.path.edge, px, py + 1, TILE, 1);
  if (wallAt(0, 1)) rect(ctx, theme.path.edge, px, py + TILE - 2, TILE, 1);
  if (wallAt(-1, 0)) rect(ctx, theme.path.edge, px + 1, py, 1, TILE);
  if (wallAt(1, 0)) rect(ctx, theme.path.edge, px + TILE - 2, py, 1, TILE);
}

function paintWall(ctx: CanvasRenderingContext2D, theme: ThemePack, px: number, py: number, isFace: boolean, x: number): void {
  if (!isFace) {
    rect(ctx, theme.wall.top, px, py, TILE, TILE);
    rect(ctx, shade(theme.wall.top, -0.2), px, py + TILE - 2, TILE, 2);
    rect(ctx, shade(theme.wall.top, 0.15), px, py, TILE, 1);
    return;
  }
  // Wall seen from the front: a strip of top plus a tall face with panels.
  rect(ctx, theme.wall.top, px, py, TILE, 4);
  rect(ctx, theme.wall.face, px, py + 4, TILE, TILE - 4);
  rect(ctx, theme.wall.trim, px, py + 4, TILE, 1);
  rect(ctx, shade(theme.wall.face, -0.3), px, py + TILE - 2, TILE, 2);
  if (x % 2 === 0) rect(ctx, shade(theme.wall.face, -0.15), px, py + 5, 1, TILE - 7);
  if (x % 4 === 1) {
    rect(ctx, shade(theme.wall.face, 0.15), px + 5, py + 7, 6, 4);
    rect(ctx, theme.wall.trim, px + 6, py + 8, 1, 1);
  }
}

function paintDoorFrame(ctx: CanvasRenderingContext2D, theme: ThemePack, px: number, py: number, horizontalWall: boolean): void {
  if (horizontalWall) {
    rect(ctx, theme.wall.trim, px, py, 2, TILE);
    rect(ctx, theme.wall.trim, px + TILE - 2, py, 2, TILE);
  } else {
    rect(ctx, theme.wall.trim, px, py, TILE, 2);
    rect(ctx, theme.wall.trim, px, py + TILE - 2, TILE, 2);
  }
}

// ── Outdoor buildings ───────────────────────────────────────────────────

const ROLE_ICONS: Partial<Record<ZoneRole, string[]>> = {
  medical: ['..aa..', '..aa..', 'aaaaaa', 'aaaaaa', '..aa..', '..aa..'],
  commerce: ['.aaaa.', 'aa.a..', '.aaaa.', '..a.aa', '.aaaa.', '..a...'],
  education: ['aaaaaa', 'a.aa.a', 'a.aa.a', 'a.aa.a', 'aaaaaa', '......'],
  social: ['..aa..', '.aaaa.', '.aaaa.', 'aaaaaa', '..aa..', '......'],
  command: ['a.....', 'aaaaa.', 'aaaaaa', 'aaaaa.', 'a.....', 'a.....'],
  production: ['..a...', 'a.a.a.', '.aaa..', 'aa.aa.', '.aaa..', 'a.a.a.'],
  storage: ['aaaaaa', 'a.aa.a', 'aaaaaa', 'a.aa.a', 'aaaaaa', '......'],
  quarters: ['..aa..', '.aaaa.', 'aaaaaa', '.a..a.', '.a..a.', '.aaaa.'],
  engineering: ['.a..a.', 'aaaaaa', '.a..a.', '.a..a.', 'aaaaaa', '.a..a.'],
  transit: ['aaaaaa', 'a....a', 'aaaaaa', 'a....a', '.a..a.', '......'],
  combat: ['..a...', '.aaa..', 'aaaaa.', '..a...', '..a...', '.aaa..'],
};

// ── City (urban themes) ─────────────────────────────────────────────────

/** Pavement: square slabs with joints and the odd crack. */
function paintPavement(ctx: CanvasRenderingContext2D, theme: ThemePack, px: number, py: number, rng: Rng, x: number, y: number): void {
  rect(ctx, (x + y) % 2 ? theme.ground.base : theme.ground.alt, px, py, TILE, TILE);
  rect(ctx, theme.ground.detail, px, py, TILE, 1);
  rect(ctx, theme.ground.detail, px, py, 1, TILE);
  rect(ctx, shade(theme.ground.base, 0.08), px + 8, py + 1, 1, TILE - 1);
  if (rng() < 0.12) {
    const cx = px + 3 + Math.floor(rng() * 9);
    const cy = py + 3 + Math.floor(rng() * 9);
    rect(ctx, theme.ground.detail, cx, cy, 2, 1);
    rect(ctx, theme.ground.detail, cx + 1, cy + 1, 2, 1);
  }
  if (rng() < 0.05) rect(ctx, '#2a8f50', px + 5, py + 5, 3, 3); // a weed
}

/** Asphalt with a curb where the road ends and dashed lane marks along it. */
function paintRoad(
  ctx: CanvasRenderingContext2D,
  theme: ThemePack,
  px: number,
  py: number,
  rng: Rng,
  connected: (dx: number, dy: number) => boolean,
  isRoad: (dx: number, dy: number) => boolean,
  x: number,
  y: number,
): void {
  rect(ctx, theme.path.base, px, py, TILE, TILE);
  speckle(ctx, rng, shade(theme.path.base, 0.12), px, py, 6);
  speckle(ctx, rng, shade(theme.path.base, -0.15), px, py, 3);
  const horizontal = isRoad(-1, 0) || isRoad(1, 0);
  const vertical = isRoad(0, -1) || isRoad(0, 1);
  if (horizontal && !vertical && x % 2 === 0) rect(ctx, '#e8d27a', px + 4, py + 7, 8, 2);
  else if (vertical && !horizontal && y % 2 === 0) rect(ctx, '#e8d27a', px + 7, py + 4, 2, 8);
  else if (horizontal && vertical) {
    // crossing: zebra stripes
    for (let i = 1; i < TILE; i += 4) rect(ctx, '#e9e6dc', px + i, py + 1, 2, 3);
  }
  if (rng() < 0.08) rect(ctx, '#23242b', px + 2 + Math.floor(rng() * 10), py + 2 + Math.floor(rng() * 10), 3, 2); // a pothole
  if (!connected(0, -1)) rect(ctx, theme.path.edge, px, py, TILE, 2);
  if (!connected(0, 1)) rect(ctx, theme.path.edge, px, py + TILE - 2, TILE, 2);
  if (!connected(-1, 0)) rect(ctx, theme.path.edge, px, py, 2, TILE);
  if (!connected(1, 0)) rect(ctx, theme.path.edge, px + TILE - 2, py, 2, TILE);
}

const NEON = ['#ff3fa4', '#3fe8ff', '#ffcd75', '#a7f070', '#b14fd6'];

/** A city block seen from above: flat roof with rooftop clutter, a facade with a neon sign. */
function paintCityBlock(ctx: CanvasRenderingContext2D, theme: ThemePack, z: Zone): void {
  const b = z.body;
  const x = b.x * TILE;
  const y = b.y * TILE;
  const w = b.w * TILE;
  const h = b.h * TILE;
  const style = buildingFor(theme, z.role);
  const rng = createRng(z.name);
  const neon = NEON[Math.floor(rng() * NEON.length)];
  const roofH = Math.max(TILE + 6, Math.floor(h * 0.62));
  const faceY = y + roofH;
  const faceH = h - roofH;

  rect(ctx, 'rgba(0,0,0,0.3)', x + 4, y + 5, w, h);
  // facade
  rect(ctx, style.wall, x, faceY, w, faceH);
  for (let i = 3; i < faceH; i += 5) rect(ctx, shade(style.wall, -0.07), x, faceY + i, w, 1);
  // flat roof with a parapet
  rect(ctx, style.roof, x, y, w, roofH);
  rect(ctx, shade(style.roof, 0.25), x, y, w, 2);
  rect(ctx, shade(style.roof, 0.25), x, y, 2, roofH);
  rect(ctx, shade(style.roof, -0.3), x + w - 2, y, 2, roofH);
  rect(ctx, shade(style.roof, -0.35), x, y + roofH - 2, w, 2);
  for (let i = 6; i < roofH - 3; i += 6) rect(ctx, shade(style.roof, -0.08), x + 3, y + i, w - 6, 1);
  // rooftop clutter: AC units, a water tank, vents
  const units = Math.max(1, Math.floor(w / 26));
  for (let i = 0; i < units; i++) {
    const ux = x + 5 + Math.floor(rng() * Math.max(1, w - 16));
    const uy = y + 4 + Math.floor(rng() * Math.max(1, roofH - 14));
    rect(ctx, P.ink, ux - 1, uy - 1, 10, 8);
    rect(ctx, P.silver, ux, uy, 8, 6);
    rect(ctx, P.slate, ux + 2, uy + 2, 4, 2);
  }
  if (w >= 40 && rng() < 0.7) {
    const tx = x + w - 14;
    const ty = y + 4;
    rect(ctx, P.ink, tx - 1, ty - 1, 10, 10);
    rect(ctx, P.brown, tx, ty, 8, 8);
    rect(ctx, P.wood, tx + 1, ty + 1, 6, 2);
  }
  if (rng() < 0.6) rect(ctx, '#2b2d36', x + 4, y + roofH - 7, 3, 3);
  frame(ctx, P.ink, x, y, w, roofH);
  frame(ctx, P.ink, x, faceY, w, faceH);

  // neon sign over the facade
  const signW = Math.min(w - 8, 28);
  const sx = x + Math.floor((w - signW) / 2);
  rect(ctx, P.ink, sx - 1, faceY + 1, signW + 2, 5);
  rect(ctx, neon, sx, faceY + 2, signW, 3);
  rect(ctx, shade(neon, 0.4), sx + 1, faceY + 2, signW - 2, 1);

  // door (a roller shutter for workshops and warehouses)
  const door = z.doors[0];
  const dx = door.x * TILE + 3;
  const dh = Math.min(faceH - 7, 12);
  const shutter = z.role === 'production' || z.role === 'storage' || z.role === 'engineering';
  rect(ctx, P.ink, dx - 1, y + h - dh - 1, 12, dh + 1);
  rect(ctx, shutter ? P.silver : '#2b2d36', dx, y + h - dh, 10, dh);
  if (shutter) for (let i = 1; i < dh; i += 2) rect(ctx, P.slate, dx, y + h - dh + i, 10, 1);
  else rect(ctx, P.cyan, dx + 1, y + h - dh + 1, 3, 3);

  // shop windows, lit at random
  const winY = faceY + 7;
  for (let wx = x + 4; wx + 8 < x + w - 2; wx += 12) {
    if (wx + 8 > dx - 3 && wx < dx + 13) continue;
    if (winY + 5 > y + h - 1) break;
    rect(ctx, P.ink, wx - 1, winY - 1, 9, Math.min(7, y + h - winY));
    rect(ctx, rng() < 0.4 ? neon : P.sky, wx, winY, 7, Math.min(5, y + h - winY - 1));
  }
}

/** A city park: lawn, palms and a basketball court. */
function paintCityPark(ctx: CanvasRenderingContext2D, theme: ThemePack, x: number, y: number, w: number, h: number, name: string): void {
  const rng = createRng(name);
  rect(ctx, '#5cc46f', x, y, w, h);
  for (let i = 0; i < w; i += 4) for (let j = 0; j < h; j += 4) if (rng() < 0.2) rect(ctx, '#4fb062', x + i, y + j, 2, 2);
  frame(ctx, theme.path.edge, x, y, w, h);
  // court
  if (w >= 40 && h >= 30) {
    const cx = x + Math.floor(w / 2) - 14;
    const cy = y + Math.floor(h / 2) - 9;
    rect(ctx, '#d9824a', cx, cy, 28, 18);
    frame(ctx, P.white, cx, cy, 28, 18);
    rect(ctx, P.white, cx + 13, cy, 1, 18);
    rect(ctx, P.ink, cx + 1, cy + 7, 2, 4);
    rect(ctx, P.ink, cx + 25, cy + 7, 2, 4);
  }
  // palms
  const palms = Math.max(2, Math.floor((w * h) / 900));
  for (let i = 0; i < palms; i++) {
    const px = x + 4 + Math.floor(rng() * Math.max(1, w - 12));
    const py = y + 8 + Math.floor(rng() * Math.max(1, h - 14));
    rect(ctx, 'rgba(0,0,0,0.25)', px + 2, py + 6, 8, 3);
    rect(ctx, P.brown, px + 3, py, 2, 8);
    rect(ctx, '#1e6646', px - 1, py - 3, 10, 3);
    rect(ctx, '#2a8f50', px, py - 4, 8, 2);
    rect(ctx, '#1e6646', px + 2, py - 6, 4, 2);
  }
}

function paintBuilding(ctx: CanvasRenderingContext2D, theme: ThemePack, z: Zone): void {
  if (theme.urban) {
    const b = z.body;
    if (z.role === 'leisure' || z.role === 'agriculture')
      return paintCityPark(ctx, theme, b.x * TILE, b.y * TILE, b.w * TILE, b.h * TILE, z.name);
    return paintCityBlock(ctx, theme, z);
  }
  const b = z.body;
  const x = b.x * TILE;
  const y = b.y * TILE;
  const w = b.w * TILE;
  const h = b.h * TILE;
  const style = buildingFor(theme, z.role);
  const rng = createRng(z.name);

  if (z.role === 'agriculture') return paintField(ctx, theme, x, y, w, h, style.roof);
  if (z.role === 'leisure') return paintPark(ctx, theme, x, y, w, h);

  const roofH = Math.max(TILE + 8, Math.floor(h * 0.55));
  const faceY = y + roofH;
  const faceH = h - roofH;

  // drop shadow
  rect(ctx, 'rgba(0,0,0,0.25)', x + 3, y + 4, w, h);
  // facade
  rect(ctx, style.wall, x, faceY, w, faceH);
  rect(ctx, shade(style.wall, -0.18), x, faceY, w, 2);
  for (let i = 4; i < faceH; i += 6) rect(ctx, shade(style.wall, -0.06), x, faceY + i, w, 1);
  // roof with shingles and an overhang
  rect(ctx, style.roof, x - 2, y, w + 4, roofH);
  for (let i = 3; i < roofH; i += 4) {
    rect(ctx, shade(style.roof, -0.2), x - 2, y + i, w + 4, 1);
    for (let j = (i / 4) % 2 ? 0 : 3; j < w + 4; j += 6) rect(ctx, shade(style.roof, -0.2), x - 2 + j, y + i - 3, 1, 3);
  }
  rect(ctx, shade(style.roof, 0.2), x - 2, y, w + 4, 2);
  rect(ctx, shade(style.roof, -0.4), x - 2, y + roofH - 2, w + 4, 2);
  frame(ctx, P.ink, x - 2, y, w + 4, roofH);
  frame(ctx, P.ink, x, faceY, w, faceH);

  // door at the door tile
  const door = z.doors[0];
  const dx = door.x * TILE + 3;
  const dh = Math.min(faceH - 2, 13);
  rect(ctx, P.ink, dx - 1, y + h - dh - 1, 12, dh + 1);
  rect(ctx, P.darkWood, dx, y + h - dh, 10, dh);
  rect(ctx, shade(P.darkWood, 0.2), dx + 1, y + h - dh + 1, 8, 2);
  rect(ctx, P.yellow, dx + 7, y + h - Math.floor(dh / 2), 1, 1);

  // windows on both sides of the door
  const winY = faceY + Math.max(3, Math.floor((faceH - 8) / 2));
  for (let wx = x + 4; wx + 8 < x + w - 2; wx += 14) {
    if (wx + 8 > dx - 3 && wx < dx + 13) continue;
    rect(ctx, P.ink, wx - 1, winY - 1, 10, 9);
    rect(ctx, rng() < 0.3 ? P.yellow : P.sky, wx, winY, 8, 7);
    rect(ctx, P.cyan, wx + 1, winY + 1, 2, 2);
    rect(ctx, P.ink, wx + 4, winY, 1, 7);
  }

  // role emblem on the roof
  const icon = ROLE_ICONS[z.role];
  if (icon) {
    const ix = x + Math.floor(w / 2) - 5;
    const iy = y + Math.floor(roofH / 2) - 5;
    rect(ctx, P.ink, ix - 1, iy - 1, 12, 12);
    rect(ctx, P.white, ix, iy, 10, 10);
    drawPixels(ctx, icon, { a: style.roof === P.white ? P.red : shade(style.roof, -0.1) }, ix + 2, iy + 2);
  }
}

function paintField(ctx: CanvasRenderingContext2D, theme: ThemePack, x: number, y: number, w: number, h: number, barn: string): void {
  const soil = floorFor(theme, 'agriculture');
  rect(ctx, soil.base, x, y, w, h);
  for (let i = 3; i < h; i += 6) {
    rect(ctx, soil.alt, x, y + i, w, 2);
    for (let j = 2; j < w - 2; j += 4) {
      rect(ctx, '#2a8f50', x + j, y + i - 2, 2, 2);
      rect(ctx, '#7fd47a', x + j, y + i - 3, 1, 1);
    }
  }
  // fence
  for (let j = 0; j < w; j += 4) {
    rect(ctx, P.brown, x + j, y - 2, 2, 4);
    rect(ctx, P.brown, x + j, y + h - 2, 2, 4);
  }
  rect(ctx, P.wood, x, y - 1, w, 1);
  rect(ctx, P.wood, x, y + h - 1, w, 1);
  // small barn in the corner
  rect(ctx, P.ink, x + w - 19, y + 1, 18, 15);
  rect(ctx, barn, x + w - 18, y + 2, 16, 6);
  rect(ctx, P.wood, x + w - 18, y + 8, 16, 7);
  rect(ctx, P.white, x + w - 13, y + 9, 6, 6);
}

function paintPark(ctx: CanvasRenderingContext2D, theme: ThemePack, x: number, y: number, w: number, h: number): void {
  rect(ctx, shade(theme.ground.base, 0.12), x, y, w, h);
  for (let i = 0; i < w; i += 4) {
    rect(ctx, '#1e6646', x + i, y, 4, 4);
    rect(ctx, '#2a8f50', x + i + 1, y, 2, 3);
  }
  const cx = x + Math.floor(w / 2);
  const cy = y + Math.floor(h / 2) + 2;
  // fountain
  rect(ctx, P.ink, cx - 9, cy - 7, 18, 14);
  rect(ctx, P.silver, cx - 8, cy - 6, 16, 12);
  rect(ctx, P.sky, cx - 6, cy - 4, 12, 8);
  rect(ctx, P.cyan, cx - 1, cy - 9, 2, 8);
  rect(ctx, P.white, cx - 3, cy - 3, 2, 1);
}

// ── City plan: street marks, towers, parking lots ─────────────────────────

const WHITE_MARK = '#e9e6dc';
const YELLOW_MARK = '#e8c64a';

function paintCity(ctx: CanvasRenderingContext2D, theme: ThemePack, map: MapModel): void {
  const city = map.city!;
  const vCols = new Set<number>();
  const hRows = new Set<number>();
  for (const s of city.streets) for (let i = 0; i < 2; i++) (s.dir === 'v' ? vCols : hRows).add(s.at + i);
  const crossing = (x: number, y: number) => vCols.has(x) && hRows.has(y);
  for (const s of city.streets) paintStreetMarks(ctx, s, crossing);
  for (const b of city.blocks) roundCorners(ctx, theme, b);
  // shadows first so no tower casts onto a taller neighbour's roof
  for (const lot of city.lots) if (lot.kind === 'tower') {
    const d = 3 + lot.height * 3;
    rect(ctx, 'rgba(10,12,24,0.32)', lot.x * TILE + d, lot.y * TILE + d, lot.w * TILE, lot.h * TILE);
  }
  for (const lot of city.lots) {
    if (lot.kind === 'tower') paintTower(ctx, lot);
    else if (lot.kind === 'parking') paintParking(ctx, theme, lot);
    else paintCityPark(ctx, theme, lot.x * TILE, lot.y * TILE, lot.w * TILE, lot.h * TILE, `park${lot.tone}`);
  }
}

/** Avenues: a double yellow line; streets: white dashes; zebra crossings next to every junction. */
function paintStreetMarks(ctx: CanvasRenderingContext2D, s: Street, crossing: (x: number, y: number) => boolean): void {
  const mid = (s.at + 1) * TILE;
  for (let i = s.from; i <= s.to; i++) {
    const [x, y] = s.dir === 'h' ? [i, s.at] : [s.at, i];
    if (crossing(x, y)) continue;
    const prev = s.dir === 'h' ? crossing(x - 1, y) : crossing(x, y - 1);
    const next = s.dir === 'h' ? crossing(x + 1, y) : crossing(x, y + 1);
    const p = i * TILE;
    if (prev || next) {
      // zebra across both lanes
      for (let k = 2; k < 2 * TILE - 2; k += 4) {
        if (s.dir === 'h') rect(ctx, WHITE_MARK, p + 3, s.at * TILE + k, TILE - 6, 2);
        else rect(ctx, WHITE_MARK, s.at * TILE + k, p + 3, 2, TILE - 6);
      }
      continue;
    }
    if (s.avenue) {
      if (s.dir === 'h') {
        rect(ctx, YELLOW_MARK, p, mid - 2, TILE, 1);
        rect(ctx, YELLOW_MARK, p, mid + 1, TILE, 1);
      } else {
        rect(ctx, YELLOW_MARK, mid - 2, p, 1, TILE);
        rect(ctx, YELLOW_MARK, mid + 1, p, 1, TILE);
      }
    } else if (s.dir === 'h') rect(ctx, WHITE_MARK, p + 4, mid - 1, 8, 2);
    else rect(ctx, WHITE_MARK, mid - 1, p + 4, 2, 8);
  }
}

/** Sidewalk corners curve into the junction. */
function roundCorners(ctx: CanvasRenderingContext2D, theme: ThemePack, b: Rect): void {
  const steps = [5, 3, 2, 1, 1];
  const corners: Array<[number, number, 1 | -1, 1 | -1]> = [
    [b.x * TILE, b.y * TILE, 1, 1],
    [(b.x + b.w) * TILE - 1, b.y * TILE, -1, 1],
    [b.x * TILE, (b.y + b.h) * TILE - 1, 1, -1],
    [(b.x + b.w) * TILE - 1, (b.y + b.h) * TILE - 1, -1, -1],
  ];
  for (const [cx, cy, sx, sy] of corners)
    steps.forEach((len, row) => {
      const y = cy + sy * row;
      const x0 = sx > 0 ? cx : cx - len + 1;
      rect(ctx, theme.path.base, x0, y, len, 1);
      rect(ctx, theme.path.edge, sx > 0 ? x0 + len : x0 - 1, y, 1, 1);
    });
}

const FACADES = ['#5b7fa6', '#7a8fa8', '#b7b0a3', '#a35d4a', '#e7c6a1', '#9fd8cf', '#f2a7c3', '#4c5566', '#c9c2b4', '#6d8f8a'];
const LIT = ['#ffe9a6', '#ffd36b', '#9ff0ff'];

/**
 * A tower seen from above with a fixed tilt: its roof on top and its south
 * facade below it. Taller towers show more facade, stepped tiers and a longer shadow.
 */
function paintTower(ctx: CanvasRenderingContext2D, lot: Lot): void {
  const rng = createRng(lot.tone * 7919 + lot.x * 31 + lot.y);
  const x = lot.x * TILE;
  const y = lot.y * TILE;
  const w = lot.w * TILE;
  const h = lot.h * TILE;
  const face = FACADES[lot.tone % FACADES.length];
  const roof = shade(face === '#4c5566' ? '#6b6f7d' : face, -0.38);
  const faceH = Math.min(Math.floor(h * 0.55), 8 + lot.height * 5);
  const roofH = h - faceH;
  const glass = lot.tone % 3 === 0;

  // south facade: a grid of windows over a shop floor
  rect(ctx, face, x, y + roofH, w, faceH);
  rect(ctx, shade(face, -0.25), x + w - 3, y + roofH, 3, faceH); // the east side, in shadow
  for (let wy = y + roofH + 3; wy + 3 < y + h - 6; wy += 5)
    for (let wx = x + 3; wx + 3 < x + w - 4; wx += glass ? 4 : 5) {
      const lit = rng() < 0.22;
      rect(ctx, lit ? pick3(rng, LIT) : shade(face, glass ? 0.25 : -0.35), wx, wy, glass ? 3 : 3, 3);
    }
  const shopY = y + h - 6;
  rect(ctx, shade(face, -0.45), x, shopY, w, 6);
  for (let sx = x + 3; sx + 6 < x + w - 3; sx += 9) rect(ctx, rng() < 0.4 ? pick3(rng, NEON) : '#2b2d36', sx, shopY + 2, 6, 3);
  frame(ctx, P.ink, x, y + roofH, w, faceH);

  // roof with a parapet
  rect(ctx, roof, x, y, w, roofH);
  rect(ctx, shade(roof, 0.3), x, y, w, 2);
  rect(ctx, shade(roof, 0.3), x, y, 2, roofH);
  rect(ctx, shade(roof, -0.3), x + w - 2, y, 2, roofH);
  rect(ctx, shade(roof, -0.3), x, y + roofH - 2, w, 2);
  frame(ctx, P.ink, x, y, w, roofH);

  // stepped tiers on taller towers
  let tx = x;
  let ty = y;
  let tw = w;
  let th = roofH;
  for (let tier = 3; tier <= lot.height && tw > 28 && th > 26; tier += 2) {
    const ix = Math.max(4, Math.floor(tw * 0.18));
    const iy = Math.max(4, Math.floor(th * 0.16));
    tx += ix;
    ty += iy;
    tw -= ix * 2;
    th -= iy * 2;
    const step = 4 + Math.floor(lot.height / 2);
    rect(ctx, 'rgba(10,12,24,0.3)', tx + 3, ty + 3, tw, th);
    rect(ctx, face, tx, ty + th - step, tw, step);
    for (let wx = tx + 2; wx + 2 < tx + tw - 2; wx += 4) rect(ctx, rng() < 0.3 ? pick3(rng, LIT) : shade(face, -0.35), wx, ty + th - step + 1, 2, 2);
    const r2 = shade(roof, 0.12 * (tier - 1) / 2);
    rect(ctx, r2, tx, ty, tw, th - step);
    rect(ctx, shade(r2, 0.3), tx, ty, tw, 1);
    frame(ctx, P.ink, tx, ty, tw, th);
  }
  // crown: a helipad on the tallest, AC units and a water tank elsewhere
  if (lot.height >= 5 && tw >= 24 && th >= 22) {
    const cx = tx + Math.floor(tw / 2);
    const cy = ty + Math.floor((th - 6) / 2);
    rect(ctx, P.ink, cx - 8, cy - 8, 16, 16);
    rect(ctx, '#3d404c', cx - 7, cy - 7, 14, 14);
    rect(ctx, YELLOW_MARK, cx - 4, cy - 4, 1, 8);
    rect(ctx, YELLOW_MARK, cx + 3, cy - 4, 1, 8);
    rect(ctx, YELLOW_MARK, cx - 4, cy, 8, 1);
  } else {
    const units = Math.max(1, Math.floor((tw * th) / 900));
    for (let i = 0; i < units; i++) {
      const ux = tx + 4 + Math.floor(rng() * Math.max(1, tw - 14));
      const uy = ty + 4 + Math.floor(rng() * Math.max(1, th - 16));
      rect(ctx, P.ink, ux - 1, uy - 1, 9, 7);
      rect(ctx, P.silver, ux, uy, 7, 5);
      rect(ctx, P.slate, ux + 2, uy + 2, 3, 1);
    }
    if (rng() < 0.5 && tw >= 30) {
      const wx = tx + tw - 13;
      const wy = ty + 4;
      rect(ctx, P.ink, wx - 1, wy - 1, 10, 10);
      rect(ctx, P.brown, wx, wy, 8, 8);
      rect(ctx, P.wood, wx + 1, wy + 1, 6, 2);
    }
  }
  if (lot.height >= 4 && rng() < 0.6) {
    // antenna with a red light
    const ax = tx + 3 + Math.floor(rng() * Math.max(1, tw - 8));
    rect(ctx, P.ink, ax, ty + 2, 1, 7);
    rect(ctx, P.red, ax - 1, ty + 1, 3, 2);
  }
}

function pick3<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

const CAR_COLORS = ['#ef7d57', '#3fe8ff', '#ffcd75', '#f4f4f4', '#b13e53', '#38b764', '#566c86', '#ff3fa4'];

/** An open-air parking lot: stalls and a few parked cars. */
function paintParking(ctx: CanvasRenderingContext2D, theme: ThemePack, lot: Lot): void {
  const rng = createRng(lot.tone + lot.x * 131 + lot.y);
  const x = lot.x * TILE;
  const y = lot.y * TILE;
  const w = lot.w * TILE;
  const h = lot.h * TILE;
  rect(ctx, shade(theme.path.base, 0.1), x, y, w, h);
  frame(ctx, theme.path.edge, x, y, w, h);
  const vertical = h >= w;
  const len = vertical ? h : w;
  for (let i = 4; i + 10 < len; i += 10) {
    for (const side of [0, 1]) {
      const sx = vertical ? x + (side ? w - 14 : 2) : x + i;
      const sy = vertical ? y + i : y + (side ? h - 14 : 2);
      if (vertical) rect(ctx, WHITE_MARK, sx, sy, 12, 1);
      else rect(ctx, WHITE_MARK, sx, sy, 1, 12);
      if (rng() < 0.55) {
        const color = pick3(rng, CAR_COLORS);
        const [cx, cy, cw, ch] = vertical ? [sx + 1, sy + 2, 11, 7] : [sx + 2, sy + 1, 7, 11];
        rect(ctx, P.ink, cx - 1, cy - 1, cw + 2, ch + 2);
        rect(ctx, color, cx, cy, cw, ch);
        if (vertical) rect(ctx, P.sky, cx + 3, cy + 1, 3, ch - 2);
        else rect(ctx, P.sky, cx + 1, cy + 3, cw - 2, 3);
      }
    }
  }
}

// ── Void: hulls and lanes ───────────────────────────────────────────────

function paintHull(ctx: CanvasRenderingContext2D, theme: ThemePack, z: Zone): void {
  const b = z.body;
  const x = b.x * TILE;
  const y = b.y * TILE;
  const w = b.w * TILE;
  const h = b.h * TILE;
  const style = buildingFor(theme, z.role);
  // engines on the left, pointed nose on the right
  for (let i = 0; i < 2; i++) {
    const ey = y + Math.floor(h * (i ? 0.62 : 0.2));
    rect(ctx, P.ink, x - 10, ey - 1, 12, 12);
    rect(ctx, shade(style.wall, -0.3), x - 9, ey, 10, 10);
    rect(ctx, P.orange, x - 13, ey + 2, 4, 6);
    rect(ctx, P.yellow, x - 15, ey + 3, 2, 4);
  }
  const half = Math.ceil(h / 2);
  const noseW = (i: number) => Math.floor((half - i) * 0.9);
  for (let i = 0; i < half; i++) {
    rect(ctx, P.ink, x + w - 1, y + i - 1, noseW(i) + 2, 1);
    rect(ctx, P.ink, x + w - 1, y + h - i, noseW(i) + 2, 1);
  }
  for (let i = 0; i < half; i++) {
    rect(ctx, style.wall, x + w - 1, y + i, noseW(i), 1);
    rect(ctx, style.wall, x + w - 1, y + h - 1 - i, noseW(i), 1);
    if (i % 3 === 0) rect(ctx, shade(style.wall, -0.15), x + w - 1, y + i, noseW(i), 1);
  }
  rect(ctx, P.cyan, x + w + 2, y + half - 3, 6, 6);
  rect(ctx, P.ink, x + w + 1, y + half - 4, 1, 8);
  rect(ctx, P.ink, x - 2, y - 2, w + 4, h + 4);
  rect(ctx, style.wall, x - 1, y - 1, w + 2, h + 2);
  rect(ctx, shade(style.wall, 0.25), x - 1, y - 1, w + 2, 2);
  rect(ctx, shade(style.wall, -0.3), x - 1, y + h - 1, w + 2, 2);
  rect(ctx, style.roof, x - 1, y + 3, w + 2, 2);
  // deck inside
  const rng = createRng(z.name);
  const floor = floorFor(theme, z.role);
  for (let ty = 1; ty < b.h - 1; ty++)
    for (let tx = 1; tx < b.w - 1; tx++) paintFloor(ctx, floor, (b.x + tx) * TILE, (b.y + ty) * TILE, tx, ty, rng);
  frame(ctx, shade(style.wall, -0.45), x + TILE - 1, y + TILE - 1, w - 2 * TILE + 2, h - 2 * TILE + 2);
  // portholes along the hull
  for (let px = x + 8; px < x + w - 8; px += 16) {
    rect(ctx, P.ink, px, y + 6, 6, 5);
    rect(ctx, P.cyan, px + 1, y + 7, 4, 3);
  }
  // doors into the hull
  for (const d of z.doors) {
    rect(ctx, P.ink, d.x * TILE + 2, d.y * TILE + 2, 12, 12);
    rect(ctx, P.yellow, d.x * TILE + 3, d.y * TILE + 3, 10, 10);
    rect(ctx, P.ink, d.x * TILE + 7, d.y * TILE + 3, 2, 10);
  }
}

function paintLane(ctx: CanvasRenderingContext2D, theme: ThemePack, path: { x: number; y: number }[]): void {
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const x0 = Math.min(a.x, b.x) * TILE + 7;
    const y0 = Math.min(a.y, b.y) * TILE + 7;
    const w = Math.abs(a.x - b.x) * TILE + 2;
    const h = Math.abs(a.y - b.y) * TILE + 2;
    rect(ctx, theme.path.edge, x0 - 1, y0 - 1, w + 2, h + 2);
    if (i % 3 !== 2) rect(ctx, theme.path.base, x0, y0, w, h);
  }
}
