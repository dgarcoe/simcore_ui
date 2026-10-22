import { useEffect, useState } from 'react';
import * as api from '../api/client';
import type { ScenarioRecord } from '../api/types';
import { runScenario, startLive, startReplay, startRun } from '../store/sources';
import { useDemoPref } from './demoPref';
import { GamesSection } from './GamesSection';
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
  const [runError, setRunError] = useState<string | null>(null);
  const [runs, setRuns] = useState<api.RunMeta[] | null>(null);
  const [outdated, setOutdated] = useState<string | null>(null);

  useEffect(() => {
    api
      .listScenarios()
      .then(setScenarios)
      .catch((e) => setApiError(String(e.message ?? e)));
    api
      .fetchState()
      .then((s) => setRunning(s ? `tick ${s.clock.tick}/${s.clock.max_ticks}` : null))
      .catch(() => {});
    api
      .fetchVersion()
      .then((v) => {
        if (v && v.ref && __SIMCORE_REF__ && !(v.ref.startsWith(__SIMCORE_REF__) || __SIMCORE_REF__.startsWith(v.ref)))
          setOutdated(`Simcore ${v.ref.slice(0, 7)} no es la versión que espera esta UI (${__SIMCORE_REF__.slice(0, 7)}).`);
        else if (!v) setOutdated('Tu Simcore es antiguo (no dice su versión): a algunos escenarios les faltarán funciones.');
      })
      .catch(() => {});
    api.listRuns().then(setRuns).catch(() => {});
    fetch('fixtures/index.json')
      .then((r) => r.json())
      .then(setFixtures)
      .catch(() => {});
  }, []);

  const run = async (id: string) => {
    setBusy(true);
    setRunError(null);
    try {
      await runScenario(id, demo, speed);
    } catch (e) {
      setRunError(String((e as Error).message));
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
          {!apiError && outdated && (
            <p className="warn">
              {outdated} Actualízalo volviendo a lanzar <code>./scripts/simcore-up.sh</code>.
            </p>
          )}
          {runError && <p className="warn">{runError}</p>}
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
                      {s.modified && <span className="dim" title="Escenario incluido con cambios guardados"> (modificado)</span>}
                      <span className="dim"> · {s.meta.agents} agentes · {s.meta.duration} · </span>
                      <ModelTag model={s.meta.llm_model} demo={demo} />
                      <p className="dim">{s.meta.description}</p>
                    </div>
                    <span className="row nowrap">
                      <button className="btn" disabled={busy} onClick={() => run(s.id)}>Ejecutar</button>
                      <button className="btn" title="Editar" onClick={() => openEditor(s)}>✎</button>
                      {s.builtin && s.modified && (
                        <button
                          className="btn"
                          title="Restaurar el original (descarta los cambios guardados)"
                          onClick={async () => {
                            if (!confirm(`¿Descartar los cambios de «${s.meta.name}» y volver al original?`)) return;
                            await api.deleteScenario(s.id);
                            setScenarios(await api.listScenarios());
                          }}
                        >
                          ↺
                        </button>
                      )}
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

        {!apiError && scenarios && <GamesSection scenarios={scenarios} demo={demo} speed={speed} />}

        {runs && (
          <section className="card">
            <h2>Simulaciones guardadas</h2>
            <p className="dim">Cada simulación lanzada en Simcore se guarda sola. Vuelve a verla, sáltate a cualquier momento o descárgala.</p>
            <ul className="scenario-list">
              {runs.map((r) => (
                <li key={r.id}>
                  <div>
                    <strong>{r.name}</strong> <span className="dim">· {runDate(r.started)} · {r.ticks} ticks · {r.demo ? 'demo' : r.model}</span>
                    <p className="dim">
                      {runOutcome(r)}
                      {r.alive.length > 0 && r.status !== 'running' && <> · vivos: {r.alive.join(', ')}</>}
                    </p>
                  </div>
                  <span className="row nowrap">
                    <button className="btn" disabled={r.events === 0} onClick={() => startRun(r.id).catch((e) => setRunError(String(e.message ?? e)))}>
                      Ver
                    </button>
                    <a className="btn" href={`/api/runs/${encodeURIComponent(r.id)}`} download={`${r.id}.json`} title="Descargar (se puede abrir como repetición)">
                      ⤓
                    </a>
                    {r.status !== 'running' && (
                      <button
                        className="btn"
                        title="Borrar"
                        onClick={async () => {
                          if (!confirm(`¿Borrar la simulación «${r.name}» del ${runDate(r.started)}?`)) return;
                          await api.deleteRun(r.id).catch((e) => setRunError(String(e.message ?? e)));
                          setRuns(await api.listRuns());
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                </li>
              ))}
              {runs.length === 0 && <li className="dim">Aún no hay ninguna. Lanza un escenario y aparecerá aquí.</li>}
            </ul>
          </section>
        )}

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

function runDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function runOutcome(r: api.RunMeta): string {
  if (r.status === 'running') return '● en curso';
  if (r.status === 'interrupted') return 'Interrumpida';
  if (r.end_reason === 'stopped') return 'Detenida';
  if (r.end_message) return r.end_message;
  if (r.end_reason === 'no_agents_left') return 'No quedó nadie';
  return 'Completada';
}

/** Local models run on this machine; anything else needs a cloud API key (or the local fallback). */
function ModelTag({ model, demo }: { model: string; demo: boolean }) {
  if (demo) return <span className="dim">demo</span>;
  if (!model) return <span className="dim">sin modelo</span>;
  if (model.startsWith('ollama')) return <span className="dim">{model}</span>;
  return (
    <span
      className="cloud-model"
      title={`${model} es un modelo de nube: necesita su clave en .env. Si arrancaste con scripts/simcore-up.sh y no hay clave, se usa el modelo local en su lugar. También puedes cambiarlo con ✎.`}
    >
      ☁ {model}
    </span>
  );
}
