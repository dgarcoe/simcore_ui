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
        <label className="toggle" title="Al final de cada día la partida se para: en las partidas con jugadores, cada uno lee su parte y puede cambiar las órdenes de su agente; el DM reanuda cuando quiere.">
          <input type="checkbox" checked={!!sim.pause_each_day} onChange={(e) => update((d) => void (e.target.checked ? (d.simulation.pause_each_day = true) : delete d.simulation.pause_each_day))} />
          Parar al final de cada día (jornadas)
        </label>
        <label className="toggle" title="Con la energía agotada, el agente cae rendido y solo puede descansar ese turno (no se pregunta al LLM). Sin marcar, solo se le avisa en el prompt.">
          <input type="checkbox" checked={sim.exhaustion !== false} onChange={(e) => update((d) => void (e.target.checked ? delete d.simulation.exhaustion : (d.simulation.exhaustion = false)))} />
          Agotamiento (sin energía, a descansar)
        </label>
        {sim.exhaustion !== false && (
          <label title="Quien cae rendido despierta allí con energía (un hospital, su casa). Vacío: descansa donde cayó">
            Quien cae rendido despierta en
            <select className="select" value={sim.exhaustion_place ?? ''} onChange={(e) => update((d) => void (e.target.value ? (d.simulation.exhaustion_place = e.target.value) : delete d.simulation.exhaustion_place))}>
              <option value="">(donde cayó)</option>
              {draft.environment.locations.map((l) => <option key={l.name}>{l.name}</option>)}
            </select>
          </label>
        )}
        <label className="toggle" title="Guarda en la grabación lo que el modelo vio y respondió en cada decisión, para revisarlo en la ficha del agente al ver la repetición. Ocupa mucho: para depurar.">
          <input type="checkbox" checked={!!draft.llm?.record_prompts} onChange={(e) => update((d) => void (e.target.checked ? ((d.llm ??= {}).record_prompts = true) : delete d.llm?.record_prompts))} />
          Guardar los prompts (depuración)
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
