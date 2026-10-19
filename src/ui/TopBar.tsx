import { bus } from '../store/bus';
import { LlmChip, TickProgress } from './LlmStatus';
import { useSim } from '../store/simStore';
import { control, leave, restartReplay } from '../store/sources';
import type { ThemeSource } from '../themes/registry';
import { THEMES } from '../themes/registry';
import type { ThemePack } from '../themes/types';

const SPEEDS: Array<[string, number]> = [
  ['0.5x', 2400],
  ['1x', 1200],
  ['2x', 600],
  ['4x', 300],
];

const SOURCE_LABEL: Record<ThemeSource, string> = {
  manual: 'manual',
  scenario: 'del escenario',
  override: 'configurado',
  heuristic: 'detectado',
  default: 'por defecto',
};

export function TopBar({ theme, detected }: { theme: ThemePack; detected: { theme: ThemePack; source: ThemeSource } }) {
  const s = useSim();
  // Right after a (re)launch, s.sim is still the previous run: don't show its clock.
  const clock = s.simFresh ? s.sim?.clock : undefined;
  const progress = Math.round((clock?.progress ?? 0) * 100);
  const live = s.mode === 'live';

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">◆</span> SIMCORE<span className="brand-dim">·PIXEL</span>
      </div>
      <div className="scenario">
        <div className="scenario-name">{s.scenarioName || 'Simulación'}</div>
        <div className="clock">
          {clock ? `${clock.time} · tick ${clock.tick}/${clock.max_ticks}` : s.simFresh ? 'esperando datos…' : 'empezando…'}
        </div>
        <TickProgress />
        <div className="progress" aria-label={`Progreso ${progress}%`}>
          <div style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="controls">
        <span className={`chip ${s.connected ? 'ok' : 'bad'}`}>
          {live ? (s.connected ? '● EN VIVO' : '○ SIN CONEXIÓN') : '▶ REPETICIÓN'}
        </span>
        <LlmChip />
        {s.status === 'ended' ? (
          <span className="chip">FIN</span>
        ) : s.paused ? (
          <button className="btn" onClick={() => control('resume')} title="Reanudar">▶</button>
        ) : (
          <button className="btn" onClick={() => control('pause')} title="Pausar">❚❚</button>
        )}
        {live && (
          <button className="btn" onClick={() => control('stop')} title="Detener simulación">■</button>
        )}
        {s.mode === 'replay' && (
          <>
            <button className="btn" onClick={restartReplay} title="Reiniciar repetición">↺</button>
            <select className="select" value={s.tickMs} onChange={(e) => s.set({ tickMs: Number(e.target.value) })} title="Velocidad">
              {SPEEDS.map(([label, ms]) => (
                <option key={ms} value={ms}>{label}</option>
              ))}
            </select>
          </>
        )}
        <select
          className="select"
          value={s.themeChoice}
          onChange={(e) => s.setThemeChoice(e.target.value)}
          title={`Tema: ${theme.label}`}
        >
          <option value="auto">Auto: {detected.theme.label} ({SOURCE_LABEL[detected.source]})</option>
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <div className="zoom">
          <button className="btn" onClick={() => bus.emit('zoom', 'out')} title="Alejar">−</button>
          <button className="btn" onClick={() => bus.emit('zoom', 'fit')} title="Ver todo">▣</button>
          <button className="btn" onClick={() => bus.emit('zoom', 'in')} title="Acercar">+</button>
        </div>
        <button className="btn" onClick={leave} title="Volver al inicio">⏏</button>
      </div>
    </header>
  );
}
