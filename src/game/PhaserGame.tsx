import Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import type { ThemePack } from '../themes/types';
import type { MapModel } from './map/model';
import { WorldScene } from './scenes/WorldScene';

interface Props {
  map: MapModel | null;
  theme: ThemePack;
}

/** Mounts one Phaser game and restarts the world scene when the map or theme changes. */
export function PhaserGame({ map, theme }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const readyRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const host = hostRef.current!;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      pixelArt: true,
      roundPixels: true,
      banner: false,
      backgroundColor: '#1a1c2c',
      scale: { mode: Phaser.Scale.RESIZE, width: host.clientWidth || 800, height: host.clientHeight || 600 },
      scene: [],
    });
    gameRef.current = game;
    readyRef.current = new Promise((resolve) =>
      game.events.once(Phaser.Core.Events.READY, () => {
        game.scene.add('world', WorldScene, false);
        resolve();
      }),
    );
    (window as any).__simcoreGame = game;
    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map) return;
    let cancelled = false;
    readyRef.current?.then(() => {
      const game = gameRef.current;
      if (cancelled || !game) return;
      game.scene.stop('world');
      game.scene.start('world', { map, theme });
    });
    return () => {
      cancelled = true;
    };
  }, [map, theme]);

  return <div ref={hostRef} className="game-host" />;
}
