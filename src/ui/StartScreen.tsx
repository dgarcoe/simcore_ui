import { useEffect, useState } from 'react';
import * as api from '../api/client';
import type { ScenarioRecord } from '../api/types';
import { runScenario, startLive, startReplay } from '../store/sources';
import { useDemoPref } from './demoPref';
import { openEditor } from './editor/draft';

interface Fixture {
  file: string;
  name: string;
  theme: string;
  description: string;
}

export function StartScreen() {
  const [scenarios, setScenarios] = useState<ScenarioRecord[] | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [demo, setDemo] = useDemoPref();
  const [speed, setSpeed] = useState(2);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .listScenarios()
      .then(setScenarios)
      .catch((e) => setApiError(String(e.message ?? e)));
    api
      .fetchState()
      .then((s) => setRunning(s ? `tick ${s.clock.tick}/${s.clock.max_ticks}` : null))
      .catch(() => {});
    fetch('fixtures/index.json')
      .then((r) => r.json())
      .then(setFixtures)
      .catch(() => {});
  }, []);

  const run = async (id: string) => {
    setBusy(true);
    try {
      await runScenario(id, demo, speed);
    } catch (e) {
      setApiError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="start">
      <h1 className="title">
        <span className="brand-mark">◆</span> SIMCORE<span className="brand-dim">·PIXEL</span>
      </h1>
      <p className="subtitle">Mira a tus agentes vivir, hablar y decidir en un mundo pixel art.</p>
      <div className="center">
        <button className="btn btn-accent" onClick={() => openEditor()}>✎ Crear escenario</button>
      </div>

      <div className="cards">
        <section className="card">
          <h2>En vivo</h2>
          {apiError ? (
            <p className="warn">
              No hay servidor Simcore en <code>/api</code> ({apiError}). Levántalo todo con <code>docker compose up</code> o
              arranca Simcore con <code>simcore manage --port 8420</code>
            </p>
          ) : (
            <>
              <button className="btn btn-accent wide" onClick={() => startLive()}>
                {running ? `Unirse a la simulación en curso (${running})` : 'Conectar y esperar'}
              </button>
              <div className="row opts">
                <label className="toggle">
                  <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} /> Modo demo: respuestas de ejemplo, sin LLM
                </label>
                <label className="toggle">
                  s/tick
                  <input className="input tiny" type="number" min={0} step={0.5} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
                </label>
              </div>
              <ul className="scenario-list">
                {(scenarios ?? []).map((s) => (
                  <li key={s.id}>
                    <div>
                      <strong>{s.meta.name}</strong>
                      <span className="dim"> · {s.meta.agents} agentes · {s.meta.duration} · {demo ? 'demo' : s.meta.llm_model || 'sin modelo'}</span>
                      <p className="dim">{s.meta.description}</p>
                    </div>
                    <span className="row nowrap">
                      <button className="btn" disabled={busy} onClick={() => run(s.id)}>Ejecutar</button>
                      <button className="btn" title={s.builtin ? 'Editar una copia' : 'Editar'} onClick={() => openEditor(s)}>✎</button>
                      {!s.builtin && (
                        <button
                          className="btn"
                          title="Borrar escenario"
                          onClick={async () => {
                            if (!confirm(`¿Borrar «${s.meta.name}»?`)) return;
                            await api.deleteScenario(s.id);
                            setScenarios((list) => (list ?? []).filter((x) => x.id !== s.id));
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  </li>
                ))}
                {scenarios === null && <li className="dim">Cargando escenarios…</li>}
              </ul>
            </>
          )}
        </section>

        <section className="card">
          <h2>Repeticiones</h2>
          <p className="dim">Simulaciones grabadas, sin servidor.</p>
          <ul className="scenario-list">
            {fixtures.map((f) => (
              <li key={f.file}>
                <div>
                  <strong>{f.name}</strong> <span className="chip small">{f.theme}</span>
                  <p className="dim">{f.description}</p>
                </div>
                <button className="btn" onClick={() => startReplay(`fixtures/${f.file}`)}>Ver</button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
