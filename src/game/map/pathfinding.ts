// 4-neighbour A* over a tile grid with per-tile movement costs.
// cost(x, y) returns Infinity for blocked tiles. A turn cost makes routes
// prefer long straight runs (nicer roads than diagonal staircases).

export interface Tile {
  x: number;
  y: number;
}

export type CostFn = (x: number, y: number) => number;

export interface PathOptions {
  /** Lower bound of any step cost, used by the heuristic. */
  minCost?: number;
  /** Extra cost paid every time the route changes direction. */
  turnCost?: number;
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
const NO_DIR = 4;

export function findPath(cols: number, rows: number, cost: CostFn, from: Tile, to: Tile, opts: PathOptions = {}): Tile[] | null {
  const minCost = opts.minCost ?? 1;
  const turnCost = opts.turnCost ?? 0;
  const tile = (x: number, y: number) => y * cols + x;
  const goal = tile(to.x, to.y);
  if (tile(from.x, from.y) === goal) return [from];

  // Search state = tile × direction of arrival.
  const states = cols * rows * 5;
  const g = new Float64Array(states).fill(Infinity);
  const came = new Int32Array(states).fill(-1);
  const closed = new Uint8Array(states);
  const heap = new MinHeap();
  const h = (t: number) => (Math.abs((t % cols) - to.x) + Math.abs(Math.floor(t / cols) - to.y)) * minCost;

  const start = tile(from.x, from.y) * 5 + NO_DIR;
  g[start] = 0;
  heap.push(start, h(tile(from.x, from.y)));
  let end = -1;

  while (heap.size > 0) {
    const cur = heap.pop();
    const t = Math.floor(cur / 5);
    if (t === goal) {
      end = cur;
      break;
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const dir = cur % 5;
    const cx = t % cols;
    const cy = Math.floor(t / cols);
    for (let d = 0; d < 4; d++) {
      const nx = cx + DIRS[d][0];
      const ny = cy + DIRS[d][1];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const nt = tile(nx, ny);
      const n = nt * 5 + d;
      if (closed[n]) continue;
      // The goal is always enterable so callers can target a blocked tile.
      const c = nt === goal ? minCost : cost(nx, ny);
      if (!Number.isFinite(c)) continue;
      const ng = g[cur] + c + (dir !== NO_DIR && dir !== d ? turnCost : 0);
      if (ng < g[n]) {
        g[n] = ng;
        came[n] = cur;
        heap.push(n, ng + h(nt));
      }
    }
  }

  if (end === -1) return null;
  const path: Tile[] = [];
  for (let s = end; s !== -1; s = came[s]) {
    const t = Math.floor(s / 5);
    path.push({ x: t % cols, y: Math.floor(t / cols) });
  }
  return path.reverse();
}

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, p: number): void {
    this.items.push(item);
    this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent] <= this.prio[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastPrio = this.prio.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.prio[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.prio[l] < this.prio[m]) m = l;
        if (r < this.items.length && this.prio[r] < this.prio[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.prio[a], this.prio[b]] = [this.prio[b], this.prio[a]];
  }
}
