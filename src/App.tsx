import { PhaserGame } from './game/PhaserGame';
import { useWorld } from './game/useWorld';
import { useSim } from './store/simStore';
import { Banner } from './ui/Banner';
import { EndCard } from './ui/EndCard';
import { ScenarioEditor } from './ui/editor/ScenarioEditor';
import { Sidebar } from './ui/Sidebar';
import { StartScreen } from './ui/StartScreen';
import { TopBar } from './ui/TopBar';

export function App() {
  const mode = useSim((s) => s.mode);
  const hasSim = useSim((s) => s.sim !== null);
  const { theme, detected, map } = useWorld();

  if (mode === 'none') return <StartScreen />;
  if (mode === 'editor') return <ScenarioEditor />;

  return (
    <div className="app" style={{ ['--accent' as string]: theme.ui.accent }}>
      <TopBar theme={theme} detected={detected} />
      <div className="main">
        <section className="stage">
          <PhaserGame map={map} theme={theme} />
          {!hasSim && <div className="waiting">Esperando a que la simulación empiece…</div>}
          <Banner />
          <EndCard />
          <div className="hint">Arrastra para mover · rueda para zoom · clic en un agente</div>
        </section>
        <Sidebar theme={theme} />
      </div>
    </div>
  );
}
