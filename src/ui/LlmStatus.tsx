import { useState } from 'react';
import type { LlmStatus } from '../store/reduce';
import { useSim } from '../store/simStore';

/** Top-bar chip: demo mock, real LLM (with call count) or failing LLM. */
export function LlmChip() {
  const llm = useSim((s) => s.llm);
  const model = useSim((s) => String(s.scenarioConfig?.llm?.model ?? ''));
  if (llm.mode === 'unknown') return null;
  if (llm.mode === 'demo')
    return (
      <span className="chip warn-chip" title="Modo demo: Simcore usa respuestas de ejemplo y no llama a ningún LLM. Desmarca «Modo demo» al ejecutar.">
        DEMO · sin LLM
      </span>
    );
  const failing = llm.failingTicks > 0;
  const hitRate = llm.calls + llm.cacheHits > 0 ? Math.round((llm.cacheHits / (llm.calls + llm.cacheHits)) * 100) : 0;
  return (
    <span
      className={`chip ${failing ? 'bad' : 'ok'}`}
      title={[
        model && `Modelo: ${model}`,
        `${llm.calls} llamadas al LLM · ${hitRate}% desde caché`,
        llm.errors ? `${llm.errors} decisiones fallidas (última: ${llm.lastError})` : '',
      ]
        .filter(Boolean)
        .join('\n')}
    >
      {failing ? 'LLM con errores' : `LLM${model ? ` · ${model.replace(/^ollama\//, '')}` : ''} · ${llm.calls}`}
    </span>
  );
}

/** Hint for the most common failures, based on the error text LiteLLM returns. */
export function llmHint(error: string): string {
  const e = error.toLowerCase();
  if (/not found|pull|no such model|model .* does not exist/.test(e))
    return 'El modelo no está descargado en Ollama: revisa `ollama list` (con scripts/simcore-up.sh se descarga solo) o cambia el modelo del escenario en el editor.';
  if (/connect|refused|resolve|name or service|timed? ?out|unreachable|11434/.test(e))
    return 'Simcore no llega a Ollama: arráncalo con scripts/simcore-up.sh (sin --demo) o revisa OLLAMA_API_BASE.';
  if (/api[_ ]?key|auth|401|403/.test(e)) return 'Falta o no es válida la clave del proveedor: revisa .env (OPENAI_API_KEY / ANTHROPIC_API_KEY).';
  return 'Ejecuta scripts/simcore-up.sh doctor para diagnosticar el LLM.';
}

/** Persistent warning while every agent decision fails. */
export function LlmAlert() {
  const llm = useSim((s) => s.llm);
  const [dismissed, setDismissed] = useState(-1);
  if (llm.mode !== 'llm' || llm.failingTicks === 0 || dismissed === llm.lastErrorTick) return null;
  return (
    <div className="llm-alert" role="alert">
      <button className="close" onClick={() => setDismissed(llm.lastErrorTick)} aria-label="Cerrar">×</button>
      <span>
        <strong>El LLM está fallando</strong>: los agentes solo esperan.
      </span>
      <code className="llm-error">{shorten(llm)}</code>
      <span>{llmHint(llm.lastError)}</span>
    </div>
  );
}

function shorten(llm: LlmStatus): string {
  return llm.lastError.length > 220 ? `${llm.lastError.slice(0, 219)}…` : llm.lastError;
}
