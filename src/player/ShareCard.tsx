import { useEffect, useRef, useState } from 'react';
import type { PlayerResults } from '../api/games';
import { awardTitle, highlightText, shareText } from '../store/awards';

const W = 600;
const H = 340;

/** The player's result as a picture and a text, to share with the group. */
export function ShareCard({ results, game }: { results: PlayerResults; game: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState('');
  const [done, setDone] = useState('');
  const r = results.result!;
  const agent = results.agent ?? '';
  const mine = (results.awards ?? []).filter((a) => a.agent === agent);
  const text = shareText({
    game,
    agent,
    rank: r.rank,
    players: r.players,
    points: r.points,
    winner: r.winner,
    awards: results.awards ?? [],
    highlights: results.highlights ?? [],
  });

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#1a1c2c';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ff3fa4';
    ctx.fillRect(0, 0, W, 6);
    ctx.fillRect(0, H - 6, W, 6);
    const line = (t: string, x: number, y: number, size: number, color = '#f4f4f4') => {
      ctx.font = `${size}px "VT323", monospace`;
      ctx.fillStyle = color;
      ctx.fillText(t.length > 64 ? `${t.slice(0, 63)}…` : t, x, y);
    };
    line(`◆ ${game}`, 24, 44, 26, '#94b0c2');
    line(agent, 24, 92, 48, '#ff3fa4');
    if (r.rank) line(`Puesto ${r.rank} de ${r.players} · ${r.points} puntos`, 24, 128, 30);
    if (r.winner) line(`👑 Ganó: ${r.winner}`, 24, 160, 24, '#ffcd75');
    let y = 196;
    for (const a of mine.slice(0, 2)) {
      const t = awardTitle(a);
      line(`${t.icon} ${t.title} — ${t.detail}`, 24, y, 24, '#a7f070');
      y += 28;
    }
    for (const h of (results.highlights ?? []).slice(0, 3)) {
      if (y > H - 24) break;
      line(`t${h.tick} · ${highlightText(h)}`, 24, y, 22, '#c0cbdc');
      y += 26;
    }
    setUrl(c.toDataURL('image/png'));
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const share = async () => {
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], `${agent}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setDone('✓ Texto copiado');
    } catch {
      setDone('');
    }
  };

  return (
    <div className="player-block">
      <h4>📤 Tu resultado para compartir</h4>
      <canvas ref={canvas} width={W} height={H} hidden aria-hidden />
      {url && <img className="share-card" src={url} alt={text} width={W} height={H} />}
      <div className="row">
        <button className="btn" onClick={share}>Compartir</button>
        {url && <a className="btn" href={url} download={`${agent || 'resultado'}.png`}>⤓ Imagen</a>}
        <button
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setDone('✓ Texto copiado');
            } catch {
              window.prompt('Copia tu resultado:', text);
            }
          }}
        >
          Copiar texto
        </button>
        {done && <span className="dim">{done}</span>}
      </div>
    </div>
  );
}
