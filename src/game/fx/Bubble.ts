import Phaser from 'phaser';
import { P } from '../../themes/palette';

export type BubbleKind = 'speech' | 'thought' | 'post' | 'action';

const STYLE: Record<BubbleKind, { fill: number; text: string; border: number }> = {
  speech: { fill: 0xf4f4f4, text: P.ink, border: 0x1a1c2c },
  thought: { fill: 0xd6e9f8, text: P.navy, border: 0x29366f },
  post: { fill: 0xffcd75, text: P.ink, border: 0x1a1c2c },
  action: { fill: 0x333c57, text: P.white, border: 0x1a1c2c },
};

const MAX_CHARS = 72;
const WRAP_PX = 128;

/** Pixel speech bubble whose text types itself out. Anchored at its tail tip. */
export class Bubble extends Phaser.GameObjects.Container {
  destroyed = false;
  readonly bw: number;
  readonly bh: number;
  private readonly label: Phaser.GameObjects.Text;
  private typer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene, text: string, kind: BubbleKind) {
    super(scene, 0, 0);
    const style = STYLE[kind];
    const clipped = text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 1).trimEnd()}…` : text;
    this.label = scene.add
      .text(0, 0, clipped, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '8px',
        color: style.text,
        lineSpacing: 3,
        wordWrap: { width: WRAP_PX, useAdvancedWrap: true },
      })
      .setResolution(4);
    // Wrap once up front so the typewriter doesn't reflow words mid-typing.
    const full = this.label.getWrappedText(clipped).join('\n');
    this.label.setWordWrapWidth(null).setText(full);
    const w = Math.ceil(this.label.width) + 10;
    const h = Math.ceil(this.label.height) + 8;
    this.bw = w;
    this.bh = h + 5;
    const g = scene.add.graphics();
    const x0 = -Math.floor(w / 2);
    const y0 = -h - 5;
    // body with clipped corners
    g.fillStyle(style.border).fillRect(x0 + 1, y0, w - 2, h).fillRect(x0, y0 + 1, w, h - 2);
    g.fillStyle(style.fill).fillRect(x0 + 1, y0 + 1, w - 2, h - 2);
    if (kind === 'thought') {
      g.fillStyle(style.border).fillRect(-3, -5, 4, 3).fillRect(-1, -2, 2, 2);
      g.fillStyle(style.fill).fillRect(-2, -4, 2, 1);
    } else {
      // tail
      g.fillStyle(style.border).fillRect(-3, -6, 7, 2).fillRect(-2, -4, 5, 2).fillRect(-1, -2, 3, 2);
      g.fillStyle(style.fill).fillRect(-2, -6, 5, 1).fillRect(-1, -5, 3, 2).fillRect(0, -3, 1, 1);
    }
    this.label.setPosition(x0 + 5, y0 + 4);
    this.add([g, this.label]);
    this.setDepth(200000);
    scene.add.existing(this);

    // typewriter effect
    this.label.setText('');
    let i = 0;
    this.typer = scene.time.addEvent({
      delay: 22,
      repeat: full.length - 1,
      callback: () => this.label.setText(full.slice(0, ++i)),
    });
  }

  popIn(): void {
    this.setScale(0.6);
    this.scene.tweens.add({ targets: this, scale: 1, duration: 120, ease: 'Back.Out' });
  }

  popOut(): void {
    this.scene.tweens.add({ targets: this, alpha: 0, duration: 200, onComplete: () => this.destroy() });
  }

  override destroy(fromScene?: boolean): void {
    this.destroyed = true;
    this.typer?.remove();
    super.destroy(fromScene);
  }
}
