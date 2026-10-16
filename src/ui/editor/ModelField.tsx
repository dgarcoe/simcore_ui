import { useEffect, useState } from 'react';
import { listLocalModels, modelOptions, modelProblem } from '../../api/models';

const OTHER = '\u0000other';
let cache: Promise<string[] | null> | null = null;

/** Models installed in Ollama (fetched once per page; null if Ollama can't be reached). */
export function useLocalModels(): [string[] | null | undefined, () => void] {
  const [models, setModels] = useState<string[] | null | undefined>(undefined);
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    (cache ??= listLocalModels()).then((m) => alive && setModels(m));
    return () => void (alive = false);
  }, [n]);
  const reload = () => {
    cache = null;
    setModels(undefined);
    setN((x) => x + 1);
  };
  return [models, reload];
}

interface Props {
  label: string;
  value: string;
  onChange: (model: string) => void;
  installed: string[] | null | undefined;
  /** Text of the empty option ("el mismo"); without it there is no empty option. */
  emptyLabel?: string;
}

/** Drop-down of installed models (plus cloud ones), with free text for anything else. */
export function ModelField({ label, value, onChange, installed, emptyLabel }: Props) {
  const [typing, setTyping] = useState(false);
  const opts = modelOptions(value, installed ?? null);
  const problem = modelProblem(value, installed ?? null);
  const firstLocal = opts.installed[0];
  return (
    <label>
      {label}
      <select
        className="select"
        value={typing ? OTHER : value}
        onChange={(e) => {
          if (e.target.value === OTHER) return setTyping(true);
          setTyping(false);
          onChange(e.target.value);
        }}
      >
        {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
        {opts.current && <option value={opts.current}>{opts.current} (del escenario)</option>}
        {opts.installed.length > 0 && (
          <optgroup label="Instalados en Ollama">
            {opts.installed.map((m) => <option key={m} value={m}>{m}</option>)}
          </optgroup>
        )}
        <optgroup label={installed ? 'De nube (necesitan clave)' : 'Sugeridos'}>
          {opts.suggested.map((m) => <option key={m} value={m}>{m}</option>)}
        </optgroup>
        <option value={OTHER}>Otro (escribir)…</option>
      </select>
      {typing && (
        <input className="input" autoFocus value={value} placeholder="ollama/nombre:etiqueta" onChange={(e) => onChange(e.target.value)} />
      )}
      {problem && (
        <span className="dim small model-warn">
          {problem === 'cloud' ? `${value} es de nube: necesita su clave en .env (sin ella, scripts/simcore-up.sh usa el modelo local).` : `${value} no está instalado en tu Ollama.`}
          {firstLocal && (
            <>
              {' '}
              <button type="button" className="btn" onClick={() => { setTyping(false); onChange(firstLocal); }}>
                Usar {firstLocal}
              </button>
            </>
          )}
        </span>
      )}
    </label>
  );
}
