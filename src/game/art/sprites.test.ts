import { describe, expect, it } from 'vitest';
import { agentFrames, EMOTES, HEADGEAR, POD, PROPS } from './sprites';

function expectGrid(rows: readonly string[], w: number, h: number | null, label: string) {
  if (h !== null) expect(rows.length, `${label} height`).toBe(h);
  rows.forEach((r, i) => expect(r.length, `${label} row ${i}`).toBe(w));
}

describe('sprite data', () => {
  it('agent frames are 16x16', () => {
    for (const f of ['down', 'up', 'side'] as const) agentFrames(f).forEach((fr, i) => expectGrid(fr, 16, 16, `${f}[${i}]`));
  });
  it('headgear rows are 16 wide', () => {
    for (const [name, byFacing] of Object.entries(HEADGEAR))
      for (const [facing, rows] of Object.entries(byFacing)) expectGrid(rows!, 16, null, `${name}.${facing}`);
  });
  it('props are 16x16', () => {
    for (const [name, rows] of Object.entries(PROPS)) expectGrid(rows, 16, 16, name);
    expectGrid(POD, 16, 16, 'pod');
  });
  it('emotes are 8x8', () => {
    for (const [name, rows] of Object.entries(EMOTES)) expectGrid(rows, 8, 8, name);
  });
});
