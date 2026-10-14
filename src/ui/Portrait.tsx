import { useEffect, useRef } from 'react';
import { drawPortrait } from '../game/art/agentLook';
import { useSim } from '../store/simStore';
import type { ThemePack } from '../themes/types';

export function Portrait({
  theme,
  name,
  scale = 2,
  profession,
}: {
  theme: ThemePack;
  name: string;
  scale?: number;
  /** Defaults to the profession from the running scenario's config. */
  profession?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const known = useSim((s) => s.professions[name]);
  const prof = profession ?? known;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 16 * scale, 16 * scale);
    drawPortrait(ctx, theme, name, scale, prof);
  }, [theme, name, scale, prof]);
  return <canvas ref={ref} width={16 * scale} height={16 * scale} className="portrait" aria-hidden />;
}
