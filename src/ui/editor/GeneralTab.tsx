import { useState } from 'react';
import { configToEnvironment, setModel } from '../../api/scenario';
import { resolveTheme, THEMES } from '../../themes/registry';
import { useDraft } from './draft';
import { ModelField, useLocalModels } from './ModelField';

export function GeneralTab() {
  const [draft, update] = useDraft();
  const [installed, reloadModels] = useLocalModels();
  const sim = draft.simulation;
  const gs = draft.environment.global_state ?? {};
  const env = configToEnvironment({ ...draft, environment: { ...draft.environment, global_state: {} } });
  const detected = resolveTheme({ scenarioName: sim.name, scenarioDescription: sim.description, env }).theme;

  return (
    <div className="ed-section">
      <label>
        Nombre
        <input className="input" value={sim.name} placeholder="Ej.: Motín en la estación Ares" onChange={(e) => update((d) => void (d.simulation.name = e.target.value))} />
      </label>
      <label>
        Descripción
        <textarea className="input" rows={3} value={sim.description ?? ''} onChange={(e) => update((d) => void (d.simulation.description = e.target.value))} />
      </label>
      <div className="ed-grid">
        <label>
          Duración
          <input className="input" value={sim.duration ?? ''} placeholder="2 days" onChange={(e) => update((d) => void (d.simulation.duration = e.target.value))} />
        </label>
        <label>
          Paso de tiempo
          <input className="input" value={sim.time_step ?? ''} placeholder="1 hour" onChange={(e) => update((d) => void (d.simulation.time_step = e.target.value))} />
        </label>
        <label>
          Idioma de los agentes
          <select className="select" value={sim.language ?? 'en'} onChange={(e) => update((d) => void (d.simulation.language = e.target.value))}>
            <option value="es">Español</option>
            <option value="en">English</option>
            <option value="pt">Português</option>
          </select>
        </label>
        <label>
          Semilla
          <input className="input" type="number" value={sim.seed ?? 42} onChange={(e) => update((d) => void (d.simulation.seed = Number(e.target.value) || 0))} />
        </label>
        <ModelField label="Modelo LLM" value={String(draft.llm?.model ?? '')} installed={installed} onChange={(m) => update((d) => setModel(d, m))} />
        <ModelField
          label="Modelo de reflexión"
          value={String(draft.llm?.reflection_model ?? '')}
          installed={installed}
          emptyLabel="(el mismo)"
          onChange={(m) => update((d) => void ((d.llm ??= {}).reflection_model = m || undefined))}
        />
        <label className="toggle" title="Cada agente escribe un plan corto cada N ticks y lo rehace cuando pasa algo importante. Cuesta una llamada al LLM más por plan.">
          <input type="checkbox" checked={!!sim.planning} onChange={(e) => update((d) => void (e.target.checked ? (d.simulation.planning = true) : delete d.simulation.planning))} />
          Planes del día
        </label>
        <label className="toggle" title="Un narrador (el LLM de reflexión) escribe un capítulo breve cada N ticks con los momentos clave. Una llamada por capítulo.">
          <input type="checkbox" checked={!!sim.story} onChange={(e) => update((d) => void (e.target.checked ? (d.simulation.story = true) : delete d.simulation.story))} />
          Crónica por capítulos
        </label>
        <label className="toggle" title="Atributos (fuerza, destreza…), habilidades y tiradas de d20: atacar, curar, convencer o engañar, y las acciones con «Tirada» dependen del personaje y del dado. Los agentes ganan experiencia y suben de nivel. Sin coste extra de LLM.">
          <input type="checkbox" checked={!!sim.rpg} onChange={(e) => update((d) => void (e.target.checked ? (d.simulation.rpg = true) : delete d.simulation.rpg))} />
          Modo rol (tiradas de dado)
        </label>
        {sim.story && (
          <label>
            Un capítulo cada (ticks)
            <input
              className="input"
              type="number"
              min={1}
              value={sim.chapter_every ?? 24}
              onChange={(e) => update((d) => void (d.simulation.chapter_every = Math.max(1, Number(e.target.value) || 24)))}
            />
          </label>
        )}
        <label title="Local: cada agente sabe solo lo que ha visto. Completa: sabe dónde está todo el mundo.">
          Conciencia de los demás
          <select
            className="input"
            value={sim.awareness ?? 'local'}
            onChange={(e) => update((d) => void (e.target.value === 'full' ? (d.simulation.awareness = 'full') : delete d.simulation.awareness))}
          >
            <option value="local">Local (lo que ve)</option>
            <option value="full">Completa</option>
          </select>
        </label>
        {sim.planning && (
          <label>
            Replanificar cada (ticks)
            <input
              className="input"
              type="number"
              min={1}
              value={sim.plan_every ?? 8}
              onChange={(e) => update((d) => void (d.simulation.plan_every = Math.max(1, Number(e.target.value) || 8)))}
            />
          </label>
        )}
        <label>
          Temperatura
          <input
            className="input"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={draft.llm?.temperature ?? 0.8}
            onChange={(e) => update((d) => void ((d.llm ??= {}).temperature = Number(e.target.value)))}
          />
        </label>
      </div>
      <span className="dim small">
        {installed === undefined
          ? 'Buscando los modelos instalados en Ollama…'
          : installed === null
            ? 'No se pudo consultar Ollama: se muestran sugerencias; elige «Otro» para escribir cualquier modelo.'
            : `${installed.length} modelos instalados en Ollama.`}{' '}
        <button type="button" className="btn" onClick={reloadModels}>↻</button>
      </span>
      <label>
        Tema visual
        <select
          className="select"
          value={String(gs.ui_theme ?? '')}
          onChange={(e) =>
            update((d) => {
              const g = (d.environment.global_state ??= {});
              if (e.target.value) g.ui_theme = e.target.value;
              else delete g.ui_theme;
            })
          }
        >
          <option value="">Auto: {detected.label}</option>
          {THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <span className="dim small">
          Se guarda como <code>global_state.ui_theme</code>; Simcore lo ignora y la UI lo usa.
        </span>
      </label>
      <WorldState />
    </div>
  );
}

/** Free-form world variables the agents see (global_state minus UI keys). */
function WorldState() {
  const [draft, update] = useDraft();
  const entries = Object.entries(draft.environment.global_state ?? {}).filter(([k]) => !k.startsWith('ui_'));
  const [text, setText] = useState(entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n'));
  return (
    <label>
      <span>
        Estado del mundo (<code>clave: valor</code>, los agentes lo ven)
      </span>
      <textarea
        className="input"
        rows={3}
        value={text}
        placeholder={'panic_level: "low"\noxygen: 0.9'}
        onChange={(e) => setText(e.target.value)}
        onBlur={() =>
          update((d) => {
            const g = d.environment.global_state ?? {};
            const kept = Object.fromEntries(Object.entries(g).filter(([k]) => k.startsWith('ui_')));
            for (const line of text.split('\n')) {
              const m = line.match(/^\s*([^:]+?)\s*:\s*(.+?)\s*$/);
              if (!m) continue;
              try {
                kept[m[1]] = JSON.parse(m[2]);
              } catch {
                kept[m[1]] = m[2];
              }
            }
            d.environment.global_state = kept;
          })
        }
      />
    </label>
  );
}
