// Paints the static part of a map (ground, roads, walls, buildings, hulls)
// into one canvas. Props, agents and labels are separate game objects.

import { P } from '../../themes/palette';
import { buildingFor, floorFor, type FloorStyle, type ThemePack } from '../../themes/types';
import type { Ground, MapModel, Zone } from '../map/model';
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
          paintGrass(ctx, theme, px, py, rng);
          break;
        case 'path':
          paintPath(ctx, theme, px, py, rng, (dx, dy) => {
            const n = g(x + dx, y + dy);
            return n === 'path' || n === 'plaza' || n === 'building';
          });
          break;
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

function paintBuilding(ctx: CanvasRenderingContext2D, theme: ThemePack, z: Zone): void {
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
