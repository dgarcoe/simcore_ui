import { useEffect, useState } from 'react';
import type { SimState } from '../api/types';
import { decisions, healthAdvice, REASON_LABEL, topReasons, usefulPct, type LlmHealth } from '../store/llmHealth';
import { isAlive } from '../store/reduce';
import { useSim } from '../store/simStore';

const PARSE_HINT =
  'El modelo no responde con el JSON que espera Simcore ({"action": "speak|move|work|rest|…", "target", "content", "reasoning"}), así que el agente se queda esperando. Suele pasar con modelos pequeños: prueba otro (p. ej. ./scripts/simcore-up.sh pull llama3.2:3b y cámbialo en el editor) o uno más grande si cabe en memoria.';

/** Top-bar chip: demo mock, real LLM (share of usable decisions), unusable answers or failing LLM; opens the health panel. */
export function LlmChip() {
  const llm = useSim((s) => s.llm);
  const model = useSim((s) => String(s.scenarioConfig?.llm?.model ?? ''));
  const [open, setOpen] = useState(false);
  if (llm.mode === 'unknown') return null;
  const panel = open && <LlmHealthPanel health={llm.health} model={model} demo={llm.mode === 'demo'} lastError={llm.lastError} onClose={() => setOpen(false)} />;
  if (llm.mode === 'demo')
    return (
      <span className="llm-chip-wrap">
        <button className="chip warn-chip" onClick={() => setOpen(!open)} title="Modo demo: Simcore usa respuestas de ejemplo y no llama a ningún LLM. Desmarca «Modo demo» al ejecutar. Pulsa para ver qué decisiones salen bien.">
          DEMO · sin LLM
        </button>
        {panel}
      </span>
    );
  const pct = usefulPct(llm.health);
  const failing = llm.failingTicks > 0;
  const someInvalid = !failing && llm.lastTickParseErrors > 0;
  const hitRate = llm.calls + llm.cacheHits > 0 ? Math.round((llm.cacheHits / (llm.calls + llm.cacheHits)) * 100) : 0;
  const shortModel = model.replace(/^ollama\//, '');
  const tone = failing ? 'bad' : pct !== null && pct < 60 ? 'bad' : someInvalid || (pct !== null && pct < 80) ? 'warn' : 'ok';
  return (
    <span className="llm-chip-wrap">
    <button
      className={`chip ${tone}`}
      onClick={() => setOpen(!open)}
      title={[
        model && `Modelo: ${model}`,
        `${llm.calls} llamadas al LLM · ${hitRate}% desde caché`,
        llm.errors ? `${llm.errors} llamadas fallidas (última: ${llm.lastError})` : '',
        llm.parseErrors ? `${llm.parseErrors} respuestas no válidas (última: ${llm.lastParseError})` : '',
        pct !== null ? `${pct} % de las decisiones se pueden llevar a cabo · pulsa para ver por qué fallan las demás` : '',
      ]
        .filter(Boolean)
        .join('\n')}
    >
      {failing
        ? llm.failKind === 'parse'
          ? 'LLM · respuestas no válidas'
          : 'LLM con errores'
        : someInvalid
          ? `LLM · ${llm.lastTickParseErrors}/${llm.lastTickDecisions} no válidas`
          : `LLM${shortModel ? ` · ${shortModel}` : ''}${pct !== null ? ` · ${pct} % útil` : ` · ${llm.calls}`}`}
    </button>
    {panel}
    </span>
  );
}

/** Which decisions of the model can be carried out, why the rest can't, and what to do about it. */
export function LlmHealthPanel({ health, model, demo, lastError, onClose }: { health: LlmHealth; model: string; demo: boolean; lastError: string; onClose: () => void }) {
  const n = decisions(health);
  const pct = usefulPct(health);
  const bad = Object.entries(health.badBy).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const advice = demo ? [] : healthAdvice(health, model, llmHint(lastError), PARSE_HINT);
  const recent = health.current.ok + health.current.bad ? [...health.recent, health.current].slice(-10) : health.recent;
  return (
    <div className="llm-health" role="dialog" aria-label="Salud del LLM">
      <button className="close" onClick={onClose} aria-label="Cerrar">×</button>
      <h3>Salud del LLM{model && <span className="dim"> · {model.replace(/^ollama\//, '')}</span>}</h3>
      {demo && <p className="dim small">Modo demo: son respuestas de ejemplo, no de un LLM. Sirve para ver qué acciones del escenario se pueden hacer.</p>}
      {!n ? (
        <p className="dim">Aún no hay decisiones.</p>
      ) : (
        <>
          <p>
            De <strong>{n}</strong> decisiones: <strong className="ok-text">{health.ok} útiles ({pct} %)</strong>
            {health.refused > 0 && <> · <span className="warn-text">{health.refused} rechazadas</span></>}
            {health.invalid > 0 && <> · <span className="bad-text">{health.invalid} ilegibles</span></>}
            {health.failed > 0 && <> · <span className="bad-text">{health.failed} fallos de conexión</span></>}
          </p>
          <div className="health-bars" title="Últimos ticks: decisiones útiles (verde) y que no sirvieron (rojo)">
            {recent.map((t) => (
              <span key={t.tick} className="health-bar" title={`t${t.tick}: ${t.ok} útiles, ${t.bad} no`}>
                <span className="good" style={{ flexGrow: t.ok }} />
                <span className="badp" style={{ flexGrow: t.bad }} />
                <small>t{t.tick}</small>
              </span>
            ))}
          </div>
          {topReasons(health).length > 0 && (
            <>
              <h4>Por qué no se pudieron hacer</h4>
              <ul className="health-reasons">
                {topReasons(health).map(([r, v]) => (
                  <li key={r}>
                    <strong>{v.count}</strong> {REASON_LABEL[r]}
                    <span className="dim small"> — {v.agent}, t{v.tick}: «{v.example}»</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {bad.length > 0 && <p className="dim small">Más decisiones fallidas: {bad.map(([a, k]) => `${a} (${k})`).join(', ')}</p>}
          {advice.length > 0 && (
            <div className="health-advice">
              {advice.map((a, i) => <p key={i}>💡 {a}</p>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Hint for the most common failures, based on the error text LiteLLM returns. */
export function llmHint(error: string): string {
  const e = error.toLowerCase();
  if (/not found|pull|no such model|model .* does not exist/.test(e))
    return 'El modelo no está descargado en Ollama: revisa `ollama list` (con scripts/simcore-up.sh se descarga solo) o cambia el modelo del escenario en el editor.';
  if (/connect|refused|resolve|name or service|timed? ?out|unreachable|11434/.test(e))
    return 'Simcore no llega a Ollama: arráncalo con scripts/simcore-up.sh (sin --demo) o revisa OLLAMA_API_BASE.';
  if (/missing credentials|api[_ ]?key|auth|401|403/.test(e)) {
    const model = useSim.getState().scenarioConfig?.llm?.model ?? 'un modelo de nube';
    return `El escenario pide ${model}, un modelo de nube, y no hay clave configurada. Cámbialo en el editor (✎) a ollama/qwen2.5:7b, añade la clave en .env (OPENAI_API_KEY / ANTHROPIC_API_KEY), o arranca con scripts/simcore-up.sh, que usa el modelo local como sustituto.`;
  }
  return 'Ejecuta scripts/simcore-up.sh doctor para diagnosticar el LLM.';
}

/** Persistent warning while every agent decision fails. */
export function LlmAlert() {
  const llm = useSim((s) => s.llm);
  const [dismissed, setDismissed] = useState(-1);
  if (llm.mode !== 'llm' || llm.failingTicks === 0 || dismissed === llm.lastErrorTick) return null;
  const parse = llm.failKind === 'parse';
  return (
    <div className="llm-alert" role="alert">
      <button className="close" onClick={() => setDismissed(llm.lastErrorTick)} aria-label="Cerrar">×</button>
      <span>
        <strong>{parse ? 'El modelo no responde en el formato esperado' : 'El LLM está fallando'}</strong>: los agentes solo esperan.
      </span>
      <code className="llm-error">{shorten(parse ? llm.lastParseError : llm.lastError)}</code>
      <span>{parse ? PARSE_HINT : llmHint(llm.lastError)}</span>
    </div>
  );
}

function shorten(text: string): string {
  return text.length > 220 ? `${text.slice(0, 219)}…` : text;
}

function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "Tick 4 · 3/6 agentes han decidido · 42 s": shows a slow LLM is still working. */
export function TickProgress() {
  const progress = useSim((s) => s.progress);
  // Before the run's first tick arrives, its agents are known from the scenario config.
  const total = useSim((s) => activeAgents(s.runAgents, s.sim, s.scenarioConfig?.agents, s.progress.tick));
  const startedAt = useSim((s) => s.tickStartedAt);
  const live = useSim((s) => s.mode === 'live' && s.status === 'running' && !s.paused);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live || progress.phase === 'idle') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live, progress.phase]);
  if (!live || progress.phase === 'idle' || !startedAt) return null;
  const done = progress.decided.length;
  const waiting = Math.max(0, total - done);
  return (
    <div className="tick-progress" title={done ? `Ya han decidido: ${progress.decided.join(', ')}` : undefined}>
      <span className="spinner" aria-hidden>◐</span>
      {progress.phase === 'reflecting'
        ? `Tick ${progress.tick} · los agentes reflexionan`
        : `Tick ${progress.tick} · ${done}/${total || '?'} agentes han decidido${waiting ? ' · esperando al LLM' : ''}`}
      {' · '}
      {elapsed(now - startedAt)}
    </div>
  );
}

/** Agents expected to decide this tick: the run's agents minus the dead, the departed and later arrivals. */
export function activeAgents(
  runAgents: string[] | null,
  sim: SimState | null,
  config: Array<{ name: string; arrives_at?: number }> | undefined,
  tick: number,
): number {
  if (!runAgents) return sim ? Object.values(sim.agents).filter(isAlive).length : 0;
  const gone = new Set(sim ? Object.values(sim.agents).filter((a) => !isAlive(a)).map((a) => a.name) : []);
  const later = new Set((config ?? []).filter((a) => (a.arrives_at ?? 0) > tick).map((a) => a.name));
  return runAgents.filter((n) => !gone.has(n) && !later.has(n)).length;
}
