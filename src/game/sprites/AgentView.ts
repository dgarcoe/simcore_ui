import Phaser from 'phaser';
import { P } from '../../themes/palette';
import type { ThemePack } from '../../themes/types';
import type { Facing } from '../art/sprites';
import { ensureAgentTexture } from '../art/textures';
import { TILE } from '../art/paintMap';
import type { Tile } from '../map/model';
import { Bubble, type BubbleKind } from '../fx/Bubble';

export const PIXEL_FONT = '"Press Start 2P", monospace';

export function tileToWorld(t: Tile): { x: number; y: number } {
  return { x: t.x * TILE + TILE / 2, y: t.y * TILE + TILE - 2 };
}

function moodColor(mood: number): number {
  if (mood > 0.35) return 0x38b764;
  if (mood > 0.05) return 0xa7f070;
  if (mood > -0.2) return 0xffcd75;
  if (mood > -0.5) return 0xef7d57;
  return 0xb13e53;
}

/** One agent on the map: animated sprite, name tag, mood pip, bubbles and emotes. */
export class AgentView {
  readonly container: Phaser.GameObjects.Container;
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly ring: Phaser.GameObjects.Ellipse;
  private readonly tag: Phaser.GameObjects.Text;
  private readonly pip: Phaser.GameObjects.Rectangle;
  private readonly texKey: string;
  private bubble: Bubble | null = null;
  private emote: Phaser.GameObjects.Image | null = null;
  private emoteBob = { y: 0 };
  private tween: Phaser.Tweens.Tween | null = null;
  private facing: Facing = 'down';

  tile: Tile;
  /** Zone the agent is in or walking to. */
  zone: string;
  walking = false;
  /** Tiles per second; tired agents walk slower. */
  speed = 6;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly theme: ThemePack,
    readonly name: string,
    tile: Tile,
    zone: string,
    onClick: (name: string) => void,
  ) {
    this.tile = tile;
    this.zone = zone;
    this.texKey = ensureAgentTexture(scene, theme, name);
    const { x, y } = tileToWorld(tile);
    const shadow = scene.add.ellipse(0, 0, 12, 4, 0x000000, 0.3);
    this.ring = scene.add.ellipse(0, 0, 18, 7).setStrokeStyle(1, 0xffcd75).setVisible(false);
    this.sprite = scene.add.sprite(0, 1, this.texKey, 0).setOrigin(0.5, 1);
    this.pip = scene.add.rectangle(0, -19, 4, 4, moodColor(0)).setStrokeStyle(1, 0x1a1c2c);
    this.tag = scene.add
      .text(0, -22, name.split(' ').slice(-1)[0], { fontFamily: PIXEL_FONT, fontSize: '8px', color: P.white })
      .setOrigin(0.5, 1)
      .setResolution(4)
      .setStroke(P.ink, 3)
      .setVisible(false);
    this.container = scene.add.container(x, y, [shadow, this.ring, this.sprite, this.pip, this.tag]);
    this.container.setDepth(y);
    this.sprite.setInteractive({ useHandCursor: true, pixelPerfect: false });
    this.sprite.on('pointerover', () => this.tag.setVisible(true));
    this.sprite.on('pointerout', () => this.tag.setVisible(this.ring.visible));
    this.sprite.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.getDistance() < 6) onClick(name);
    });
    this.playIdle();
  }

  get x(): number {
    return this.container.x;
  }

  get y(): number {
    return this.container.y;
  }

  setSelected(selected: boolean): void {
    this.ring.setVisible(selected);
    this.tag.setVisible(selected);
  }

  setMood(mood: number, energy: number): void {
    this.pip.setFillStyle(moodColor(mood));
    this.speed = 3 + Math.max(0, Math.min(1, energy)) * 4;
  }

  face(dx: number, dy: number): void {
    if (Math.abs(dx) > Math.abs(dy)) {
      this.facing = 'side';
      this.sprite.setFlipX(dx < 0);
    } else if (dy !== 0) {
      this.facing = dy < 0 ? 'up' : 'down';
      this.sprite.setFlipX(false);
    }
  }

  faceToward(other: AgentView): void {
    this.face(other.x - this.x, other.y - this.y);
    if (!this.walking) this.playIdle();
  }

  private playIdle(): void {
    this.sprite.play(`${this.texKey}:idle:${this.facing}`, true);
  }

  /**
   * Walks along a tile path. `isLane` tells whether a tile is open space,
   * where the agent is shown flying a small pod instead of walking.
   */
  walk(path: Tile[], isLane: (t: Tile) => boolean, onArrive?: () => void): void {
    this.stop();
    this.walking = true;
    let i = path.length > 1 && path[0].x === this.tile.x && path[0].y === this.tile.y ? 1 : 0;
    const step = () => {
      if (i >= path.length) {
        this.walking = false;
        this.sprite.setTexture(this.texKey, 0);
        this.playIdle();
        onArrive?.();
        return;
      }
      const t = path[i++];
      const { x, y } = tileToWorld(t);
      this.face(x - this.container.x, y - this.container.y);
      if (isLane(t)) {
        this.sprite.stop();
        this.sprite.setTexture(`${this.theme.id}:pod`);
        this.sprite.setFlipX(x < this.container.x);
      } else {
        if (this.sprite.texture.key !== this.texKey) this.sprite.setTexture(this.texKey, 0);
        this.sprite.play(`${this.texKey}:walk:${this.facing}`, true);
      }
      this.tile = t;
      this.tween = this.scene.tweens.add({
        targets: this.container,
        x,
        y,
        duration: 1000 / (isLane(t) ? this.speed * 2.5 : this.speed),
        onUpdate: () => this.container.setDepth(this.container.y),
        onComplete: step,
      });
    };
    step();
  }

  /** Jumps straight to a tile (used when reconciling with server state). */
  place(t: Tile): void {
    this.stop();
    this.tile = t;
    const { x, y } = tileToWorld(t);
    this.container.setPosition(x, y).setDepth(y);
    this.sprite.setTexture(this.texKey, 0);
    this.playIdle();
  }

  stop(): void {
    this.tween?.stop();
    this.tween = null;
    this.walking = false;
  }

  say(text: string, kind: BubbleKind = 'speech', ms?: number): void {
    this.bubble?.destroy();
    this.bubble = new Bubble(this.scene, text, kind);
    const duration = ms ?? Math.min(6500, 2200 + text.length * 45);
    this.bubble.popIn();
    this.scene.time.delayedCall(duration, () => {
      const b = this.bubble;
      if (b && !b.destroyed) b.popOut();
    });
    this.update();
  }

  showEmote(key: string): void {
    this.emote?.destroy();
    const img = this.scene.add.image(this.x + 8, this.y - 22, `emote:${key}`).setDepth(200001);
    this.emote = img;
    this.emoteBob.y = 0;
    this.scene.tweens.add({ targets: this.emoteBob, y: -4, duration: 180, yoyo: true, repeat: 1 });
    this.scene.tweens.add({
      targets: img,
      alpha: 0,
      delay: 1600,
      duration: 300,
      onComplete: () => {
        img.destroy();
        if (this.emote === img) this.emote = null;
      },
    });
  }

  /** Keeps floating UI attached while the agent moves. Returns the live bubble, if any. */
  update(): Bubble | null {
    if (this.bubble?.destroyed) this.bubble = null;
    this.bubble?.setPosition(Math.round(this.x), Math.round(this.y - 24));
    this.emote?.setPosition(Math.round(this.x + 8), Math.round(this.y - 22 + this.emoteBob.y));
    return this.bubble;
  }

  destroy(): void {
    this.stop();
    this.bubble?.destroy();
    this.emote?.destroy();
    this.container.destroy();
  }
}
