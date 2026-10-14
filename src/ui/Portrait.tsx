import { useEffect, useRef } from 'react';
import { drawPortrait } from '../game/art/agentLook';
import type { ThemePack } from '../themes/types';

export function Portrait({ theme, name, scale = 2 }: { theme: ThemePack; name: string; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 16 * scale, 16 * scale);
    drawPortrait(ctx, theme, name, scale);
  }, [theme, name, scale]);
  return <canvas ref={ref} width={16 * scale} height={16 * scale} className="portrait" aria-hidden />;
}
