// Theme-agnostic map model. A scenario's locations become zones placed on a
// tile grid; links between zones are carved as paths / corridors / lanes.
// Themes only decide how each ground type, zone role and prop looks.

import type { Environment, Location } from '../../api/types';
import { findPath, type Tile } from './pathfinding';
import { resolveRole, type ZoneRole } from './roles';
import { createRng, pick, type Rng } from './rng';

export type { Tile };
export type LayoutKind = 'outdoor' | 'indoor' | 'void';

export type Ground =
  | 'void' // outside of everything (space, hull exterior, ...)
  | 'ground' // open terrain (outdoor)
  | 'path' // outdoor road between zones
  | 'plaza' // outdoor paved area in front of a building
  | 'building' // outdoor building footprint (not walkable)
  | 'floor' // room / deck floor
  | 'corridor' // indoor corridor
  | 'wall' // indoor wall
  | 'door' // opening into a zone
  | 'lane'; // void travel lane between zones

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Zone {
  name: string;
  role: ZoneRole;
  description: string;
  capacity: number;
  /** Building footprint (outdoor), room floor (indoor) or hull (void). */
  body: Rect;
  doors: Tile[];
  /** Tiles where agents gather, best spots first. */
  spots: Tile[];
  /** Where the name label goes (tile coords, label centered on x). */
  label: Tile;
}

export interface Prop {
  x: number;
  y: number;
  /** Semantic key: generic scenery ('tree', 'rock', ...) or `<role>:<n>` decor. */
  key: string;
  zone?: string;
}

export interface Link {
  from: string;
  to: string;
  path: Tile[];
}

export interface MapModel {
  layout: LayoutKind;
  cols: number;
  rows: number;
  ground: Ground[];
  zones: Zone[];
  links: Link[];
  props: Prop[];
}

const SLOT = { outdoor: { w: 12, h: 11 }, indoor: { w: 14, h: 12 }, void: { w: 16, h: 13 } } as const;
const MARGIN = 2;

const WALKABLE: Record<LayoutKind, ReadonlySet<Ground>> = {
  outdoor: new Set(['ground', 'path', 'plaza']),
  indoor: new Set(['floor', 'corridor', 'door']),
  void: new Set(['floor', 'door', 'lane']),
};

export function isWalkable(map: MapModel, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.cols || y >= map.rows) return false;
  return WALKABLE[map.layout].has(map.ground[y * map.cols + x]);
}

/** Cheapest walking route between two tiles, preferring paths/corridors. */
export function routeBetween(map: MapModel, from: Tile, to: Tile): Tile[] | null {
  return findPath(
    map.cols,
    map.rows,
    (x, y) => {
      if (!isWalkable(map, x, y)) return Infinity;
      const g = map.ground[y * map.cols + x];
      return g === 'path' || g === 'corridor' || g === 'lane' ? 1 : g === 'ground' ? 3 : 1.5;
    },
    from,
    to,
    { turnCost: 0.2 },
  );
}

export function mapLocations(env: Environment): Location[] {
  return Object.values(env.locations).filter((l) => !l.virtual);
}

export function generateMap(env: Environment, layout: LayoutKind, seed: string): MapModel {
  const rng = createRng(`${seed}|${layout}`);
  const locations = mapLocations(env);
  const slot = SLOT[layout];
  const cells = assignCells(locations);
  const nCols = Math.max(1, ...cells.map((c) => c.col + 1));
  const nRows = Math.max(1, ...cells.map((c) => c.row + 1));
  const cols = MARGIN * 2 + nCols * slot.w;
  const rows = MARGIN * 2 + nRows * slot.h;
  const base: Ground = layout === 'outdoor' ? 'ground' : 'void';
  const map: MapModel = { layout, cols, rows, ground: new Array(cols * rows).fill(base), zones: [], links: [], props: [] };

  locations.forEach((loc, i) => {
    const { col, row } = cells[i];
    const ox = MARGIN + col * slot.w;
    const oy = MARGIN + row * slot.h;
    map.zones.push(buildZone(map, loc, ox, oy, slot.w, slot.h));
  });

  const edges = linkGraph(map.zones);
  for (const [a, b] of edges) {
    const path = carveLink(map, map.zones[a], map.zones[b]);
    if (path) map.links.push({ from: map.zones[a].name, to: map.zones[b].name, path });
  }
  if (layout === 'indoor') raiseWalls(map);
  scatterProps(map, rng);
  return map;
}

/**
 * Scenario positions are sparse grid coordinates (e.g. [8,8], [12,6]).
 * Rank-compress them so relative placement is kept without empty space.
 */
function assignCells(locations: Location[]): Array<{ col: number; row: number }> {
  const xs = [...new Set(locations.map((l) => l.position?.[0] ?? 0))].sort((a, b) => a - b);
  const ys = [...new Set(locations.map((l) => l.position?.[1] ?? 0))].sort((a, b) => a - b);
  const taken = new Set<string>();
  return locations.map((l) => {
    let col = xs.indexOf(l.position?.[0] ?? 0);
    const row = ys.indexOf(l.position?.[1] ?? 0);
    while (taken.has(`${col},${row}`)) col++;
    taken.add(`${col},${row}`);
    return { col, row };
  });
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function set(map: MapModel, x: number, y: number, g: Ground): void {
  if (x >= 0 && y >= 0 && x < map.cols && y < map.rows) map.ground[y * map.cols + x] = g;
}

function get(map: MapModel, x: number, y: number): Ground | undefined {
  if (x < 0 || y < 0 || x >= map.cols || y >= map.rows) return undefined;
  return map.ground[y * map.cols + x];
}

function fill(map: MapModel, r: Rect, g: Ground): void {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set(map, x, y, g);
}

function center(r: Rect): Tile {
  return { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
}

/** Tiles of a rect ordered from the given point outward. */
function spotsAround(r: Rect, from: Tile, skip: (t: Tile) => boolean = () => false): Tile[] {
  const out: Tile[] = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (!skip({ x, y })) out.push({ x, y });
  return out.sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y));
}

function buildZone(map: MapModel, loc: Location, ox: number, oy: number, sw: number, sh: number): Zone {
  const cap = loc.capacity ?? 20;
  const role = resolveRole(loc);
  const base = {
    name: loc.name,
    role,
    description: String(loc.properties?.description ?? ''),
    capacity: cap,
  };

  if (map.layout === 'outdoor') {
    // Building on top, a paved plaza in front of its door where agents gather.
    const w = clamp(5 + Math.round(cap / 12), 5, 9);
    const h = clamp(3 + Math.round(cap / 20), 3, 5);
    const plazaH = 3;
    const x = ox + Math.floor((sw - w) / 2);
    const y = oy + Math.floor((sh - h - plazaH) / 2);
    const body = { x, y, w, h };
    const plaza = { x: x - 1, y: y + h, w: w + 2, h: plazaH };
    fill(map, body, 'building');
    fill(map, plaza, 'plaza');
    const door = { x: x + Math.floor(w / 2), y: y + h - 1 };
    return { ...base, body, doors: [door], spots: spotsAround(plaza, { x: door.x, y: door.y + 1 }), label: { x: door.x, y: y - 1 } };
  }

  if (map.layout === 'indoor') {
    const w = clamp(5 + Math.round(cap / 8), 6, 10);
    const h = clamp(4 + Math.round(cap / 12), 5, 7);
    const x = ox + Math.floor((sw - w) / 2);
    const y = oy + Math.floor((sh - h) / 2);
    const body = { x, y, w, h };
    fill(map, body, 'floor');
    // Top row holds furniture, so agents stand below it.
    const standing = { x, y: y + 1, w, h: h - 1 };
    return { ...base, body, doors: [], spots: spotsAround(standing, center(body)), label: { x: x + Math.floor(w / 2), y: y - 1 } };
  }

  // void: a hull floating in space; agents stand on its deck.
  const w = clamp(6 + Math.round(cap / 8), 7, 12);
  const h = clamp(4 + Math.round(cap / 14), 5, 8);
  const x = ox + Math.floor((sw - w) / 2);
  const y = oy + Math.floor((sh - h) / 2);
  const body = { x, y, w, h };
  fill(map, body, 'floor');
  const deck = { x: x + 1, y: y + 2, w: w - 2, h: h - 3 };
  return { ...base, body, doors: [], spots: spotsAround(deck, center(body)), label: { x: x + Math.floor(w / 2), y: y - 1 } };
}

/** Minimum spanning tree over zone centers plus a few short extra loops. */
function linkGraph(zones: Zone[]): Array<[number, number]> {
  const n = zones.length;
  if (n < 2) return [];
  const c = zones.map((z) => center(z.body));
  const d = (a: number, b: number) => Math.hypot(c[a].x - c[b].x, c[a].y - c[b].y);
  const inTree = new Set([0]);
  const edges: Array<[number, number]> = [];
  while (inTree.size < n) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (const a of inTree)
      for (let b = 0; b < n; b++)
        if (!inTree.has(b) && d(a, b) < bestD) {
          bestD = d(a, b);
          best = [a, b];
        }
    edges.push(best!);
    inTree.add(best![1]);
  }
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const have = new Set(edges.map(([a, b]) => key(a, b)));
  const mstMax = Math.max(...edges.map(([a, b]) => d(a, b)));
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      if (!have.has(key(a, b)) && d(a, b) <= mstMax * 0.8 && edges.length < n + Math.floor(n / 3)) {
        edges.push([a, b]);
        have.add(key(a, b));
      }
  return edges;
}

function inRect(r: Rect, x: number, y: number, pad = 0): boolean {
  return x >= r.x - pad && y >= r.y - pad && x < r.x + r.w + pad && y < r.y + r.h + pad;
}

/** Point just outside the zone, on the side facing `toward`. */
function exitToward(map: MapModel, z: Zone, toward: Tile): { door: Tile; exit: Tile } {
  const b = z.body;
  const c = center(b);
  if (map.layout === 'outdoor') {
    const door = z.doors[0];
    return { door, exit: { x: door.x, y: b.y + b.h + 1 } };
  }
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  // Indoor doors sit in the wall ring; void rooms are entered from the hull edge.
  const pad = map.layout === 'indoor' ? 1 : 0;
  if (Math.abs(dx) * b.h > Math.abs(dy) * b.w) {
    const x = dx > 0 ? b.x + b.w - 1 + pad : b.x - pad;
    return { door: { x, y: c.y }, exit: { x: x + (dx > 0 ? 1 : -1), y: c.y } };
  }
  const y = dy > 0 ? b.y + b.h - 1 + pad : b.y - pad;
  return { door: { x: c.x, y }, exit: { x: c.x, y: y + (dy > 0 ? 1 : -1) } };
}

function carveLink(map: MapModel, a: Zone, b: Zone): Tile[] | null {
  const ea = exitToward(map, a, center(b.body));
  const eb = exitToward(map, b, center(a.body));
  // Indoor corridors must keep one tile of wall around every room.
  const pad = map.layout === 'indoor' ? 1 : 0;
  const carved: Ground = map.layout === 'outdoor' ? 'path' : map.layout === 'indoor' ? 'corridor' : 'lane';
  const path = findPath(
    map.cols,
    map.rows,
    (x, y) => {
      if (x < 1 || y < 1 || x >= map.cols - 1 || y >= map.rows - 1) return Infinity;
      if (map.zones.some((z) => inRect(z.body, x, y, pad))) return Infinity;
      const g = get(map, x, y);
      if (g === 'plaza') return 0.6;
      // Reusing existing roads keeps the network tidy.
      return g === carved ? 0.5 : 1;
    },
    ea.exit,
    eb.exit,
    { minCost: 0.5, turnCost: 3 },
  );
  if (!path) return null;
  for (const t of path) if (get(map, t.x, t.y) !== 'plaza') set(map, t.x, t.y, carved);
  for (const { door, z } of [
    { door: ea.door, z: a },
    { door: eb.door, z: b },
  ]) {
    if (map.layout !== 'outdoor') {
      set(map, door.x, door.y, 'door');
      if (!z.doors.some((d) => d.x === door.x && d.y === door.y)) z.doors.push(door);
    }
  }
  return [ea.door, ...path, eb.door];
}

function raiseWalls(map: MapModel): void {
  const open = new Set<Ground>(['floor', 'corridor', 'door']);
  const walls: number[] = [];
  for (let y = 0; y < map.rows; y++)
    for (let x = 0; x < map.cols; x++) {
      if (get(map, x, y) !== 'void') continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++)
        for (let dx = -1; dx <= 1 && !near; dx++) near = open.has(get(map, x + dx, y + dy) as Ground);
      if (near) walls.push(y * map.cols + x);
    }
  for (const i of walls) map.ground[i] = 'wall';
}

const SCENERY = ['tree', 'tree', 'tree', 'pine', 'bush', 'bush', 'flowers', 'rock', 'grass'] as const;

function scatterProps(map: MapModel, rng: Rng): void {
  if (map.layout === 'outdoor') {
    for (let y = 1; y < map.rows - 1; y++)
      for (let x = 0; x < map.cols; x++) {
        if (get(map, x, y) !== 'ground') continue;
        let clear = true;
        for (let dy = -1; dy <= 1 && clear; dy++)
          for (let dx = -1; dx <= 1 && clear; dx++) clear = (get(map, x + dx, y + dy) ?? 'ground') === 'ground';
        if (clear && rng() < 0.11) map.props.push({ x, y, key: pick(rng, SCENERY) });
      }
    return;
  }
  // Furniture along the top row of each room / deck, avoiding doors.
  for (const z of map.zones) {
    const b = z.body;
    const y = map.layout === 'void' ? b.y + 1 : b.y;
    const x0 = map.layout === 'void' ? b.x + 1 : b.x;
    const x1 = map.layout === 'void' ? b.x + b.w - 1 : b.x + b.w;
    for (let x = x0; x < x1; x++) {
      const nextToDoor = z.doors.some((d) => Math.abs(d.x - x) <= 1 && Math.abs(d.y - y) <= 1);
      if (!nextToDoor && rng() < 0.7) map.props.push({ x, y, key: `${z.role}:${Math.floor(rng() * 4)}`, zone: z.name });
    }
  }
  if (map.layout === 'void') {
    for (let i = 0; i < (map.cols * map.rows) / 140; i++) {
      const x = Math.floor(rng() * map.cols);
      const y = Math.floor(rng() * map.rows);
      if (get(map, x, y) === 'void') map.props.push({ x, y, key: pick(rng, ['asteroid', 'debris', 'debris'] as const) });
    }
  }
}
