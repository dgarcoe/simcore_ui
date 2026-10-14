// Builds every Phaser texture for a theme from code-drawn pixel art.

import Phaser from 'phaser';
import { P } from '../../themes/palette';
import type { ThemePack } from '../../themes/types';
import { agentLook } from './agentLook';
import { drawPixels, makeCanvas, overlay } from './pixel';
import { agentFrames, EMOTES, HEADGEAR, POD, PROPS, WALK_FRAMES, type Facing } from './sprites';

export const FACINGS: Facing[] = ['down', 'up', 'side'];

export function propKey(theme: ThemePack, key: string): string {
  return `${theme.id}:prop:${key}`;
}

export function agentKey(theme: ThemePack, name: string): string {
  return `${theme.id}:agent:${name}`;
}

function addCanvas(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): Phaser.Textures.Texture {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  return scene.textures.addCanvas(key, canvas)!;
}

export function ensureSharedTextures(scene: Phaser.Scene, theme: ThemePack): void {
  for (const [key, rows] of Object.entries(PROPS)) {
    const k = propKey(theme, key);
    if (scene.textures.exists(k)) continue;
    const c = makeCanvas(16, 16);
    drawPixels(c.getContext('2d')!, rows, theme.propColors);
    addCanvas(scene, k, c);
  }

  const emoteColors: Record<string, [string, string]> = {
    alert: [P.red, P.red],
    question: [P.blue, P.blue],
    sleep: [P.sky, P.sky],
    heart: [P.red, P.red],
    coin: [P.yellow, P.orange],
    gear: [P.slate, P.slate],
    dots: [P.ink, P.ink],
    eye: [P.ink, P.sky],
    hand: [P.tan, P.tan],
    idea: [P.orange, P.yellow],
    mega: [P.plum, P.orange],
  };
  for (const [key, rows] of Object.entries(EMOTES)) {
    const k = `emote:${key}`;
    if (scene.textures.exists(k)) continue;
    // 12x12 white badge with the 8x8 icon inside
    const c = makeCanvas(12, 12);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = P.ink;
    ctx.fillRect(1, 0, 10, 12);
    ctx.fillRect(0, 1, 12, 10);
    ctx.fillStyle = P.white;
    ctx.fillRect(1, 1, 10, 10);
    const [a, A] = emoteColors[key] ?? [P.ink, P.ink];
    drawPixels(ctx, rows, { a, A }, 2, 2);
    addCanvas(scene, k, c);
  }

  if (!scene.textures.exists(`${theme.id}:pod`)) {
    const c = makeCanvas(16, 16);
    drawPixels(c.getContext('2d')!, POD, { o: P.ink, m: '#c2c7d1', M: P.slate, v: P.cyan, f: P.yellow, F: P.orange });
    addCanvas(scene, `${theme.id}:pod`, c);
  }

  if (!scene.textures.exists('px')) {
    const c = makeCanvas(2, 2);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 2, 2);
    addCanvas(scene, 'px', c);
  }

  if (theme.ambient === 'stars' && !scene.textures.exists('stars')) {
    const c = makeCanvas(256, 256);
    const ctx = c.getContext('2d')!;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 140; i++) {
      const b = rnd();
      ctx.fillStyle = b > 0.9 ? P.white : b > 0.6 ? P.silver : P.slate;
      const s = b > 0.97 ? 2 : 1;
      ctx.fillRect(Math.floor(rnd() * 256), Math.floor(rnd() * 256), s, s);
    }
    addCanvas(scene, 'stars', c);
  }
}

/** Per-agent spritesheet: 3 facings × 4 walk frames, colors derived from the name. */
export function ensureAgentTexture(scene: Phaser.Scene, theme: ThemePack, name: string): string {
  const key = agentKey(theme, name);
  if (scene.textures.exists(key)) return key;
  const { slots, gear } = agentLook(theme, name);
  const canvas = makeCanvas(16 * WALK_FRAMES * FACINGS.length, 16);
  const ctx = canvas.getContext('2d')!;
  FACINGS.forEach((facing, fi) => {
    agentFrames(facing).forEach((rows, i) => {
      const withGear = gear ? overlay(rows, HEADGEAR[gear]?.[facing]) : rows;
      drawPixels(ctx, withGear, slots, (fi * WALK_FRAMES + i) * 16, 0);
    });
  });
  const tex = addCanvas(scene, key, canvas);
  for (let i = 0; i < WALK_FRAMES * FACINGS.length; i++) tex.add(i, 0, i * 16, 0, 16, 16);

  FACINGS.forEach((facing, fi) => {
    const frames = [0, 1, 2, 3].map((i) => ({ key, frame: fi * WALK_FRAMES + i }));
    scene.anims.create({ key: `${key}:walk:${facing}`, frames, frameRate: 8, repeat: -1 });
    scene.anims.create({ key: `${key}:idle:${facing}`, frames: [frames[0]], frameRate: 1 });
  });
  return key;
}
