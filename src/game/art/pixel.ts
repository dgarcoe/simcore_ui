import type { Pixels } from './sprites';

export type Slots = Record<string, string | undefined>;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Draws ASCII pixel art; '.' and unmapped slots are transparent. */
export function drawPixels(
  ctx: CanvasRenderingContext2D,
  rows: Pixels,
  slots: Slots,
  ox = 0,
  oy = 0,
  opts: { flip?: boolean; scale?: number } = {},
): void {
  const s = opts.scale ?? 1;
  const w = rows[0]?.length ?? 0;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = slots[row[x]];
      if (!color || row[x] === '.') continue;
      ctx.fillStyle = color;
      const px = opts.flip ? w - 1 - x : x;
      ctx.fillRect(ox + px * s, oy + y * s, s, s);
    }
  });
}

/** Overlays rows on top of base rows (non-'.' chars replace). */
export function overlay(base: Pixels, top: Pixels | undefined): string[] {
  if (!top) return [...base];
  return base.map((row, y) => {
    const t = top[y];
    if (!t) return row;
    let out = '';
    for (let x = 0; x < row.length; x++) out += t[x] && t[x] !== '.' ? t[x] : row[x];
    return out;
  });
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** Lightens (amt > 0) or darkens (amt < 0) a #rrggbb color. */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const f = (c: number) => clamp255(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `#${((f(r) << 16) | (f(g) << 8) | f(b)).toString(16).padStart(6, '0')}`;
}

export function rect(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** 1px outline rectangle. */
export function frame(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  rect(ctx, color, x, y, w, 1);
  rect(ctx, color, x, y + h - 1, w, 1);
  rect(ctx, color, x, y, 1, h);
  rect(ctx, color, x + w - 1, y, 1, h);
}
