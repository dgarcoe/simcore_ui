import type { AgentConfig } from '../api/scenario';
import { FIXED_FIELDS, pointsSpent, type GameTemplate } from '../api/games';
import { ATTRIBUTES, SKILLS, modifier, signed } from '../store/rpg';

const TRAITS: Array<[string, string, string]> = [
  ['openness', 'Apertura', 'curiosidad, imaginación'],
  ['conscientiousness', 'Responsabilidad', 'orden, disciplina'],
  ['extraversion', 'Extraversión', 'sociable, hablador'],
  ['agreeableness', 'Amabilidad', 'confiado, cooperativo'],
  ['neuroticism', 'Neuroticismo', 'nervioso, inestable'],
];

type Agent = Partial<AgentConfig>;

/** The player's agent: only the fields the DM lets them edit, within the DM's limits. */
export function AgentForm({
  agent,
  template,
  readOnly,
  onChange,
}: {
  agent: Agent;
  template: GameTemplate;
  readOnly: boolean;
  onChange: (a: Agent) => void;
}) {
  const can = (f: string) => template.editable.includes(f);
  const set = (patch: Agent) => onChange({ ...agent, ...patch });
  const fixed = (Array.isArray(template.fixed) ? template.fixed : Object.keys(template.fixed)).map((f) => FIXED_FIELDS[f] ?? f);
  const spent = pointsSpent(agent.attributes);
  const left = template.attribute_budget - spent;
  const lines = (v: string[] | undefined) => (v ?? []).join('\n');
  const toLines = (s: string) => s.split('\n').slice(0, template.max_goals);

  return (
    <fieldset className="player-form" disabled={readOnly}>
      {can('name') && (
        <label>
          Nombre de tu agente
          <input className="input" maxLength={40} value={agent.name ?? ''} onChange={(e) => set({ name: e.target.value })} />
        </label>
      )}
      {can('profession') && (
        <label>
          Profesión
          {template.professions.length ? (
            <select className="select" value={agent.profession ?? ''} onChange={(e) => set({ profession: e.target.value })}>
              <option value="">(elige)</option>
              {template.professions.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          ) : (
            <input className="input" maxLength={template.max_text} value={agent.profession ?? ''} onChange={(e) => set({ profession: e.target.value })} />
          )}
        </label>
      )}
      {can('age') && (
        <label>
          Edad
          <input className="input" type="number" min={14} max={99} value={agent.age ?? 30} onChange={(e) => set({ age: Number(e.target.value) })} />
        </label>
      )}
      {can('personality') && (
        <div className="player-block">
          <h4>Personalidad</h4>
          {TRAITS.map(([k, label, hint]) => {
            const v = (agent.personality as Record<string, number> | undefined)?.[k] ?? 0.5;
            return (
              <label key={k} className="trait" title={hint}>
                <span>{label}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={v}
                  onChange={(e) => set({ personality: { ...(agent.personality ?? {}), [k]: Number(e.target.value) } })}
                />
                <span className="dim">{v < 0.35 ? 'poca' : v > 0.65 ? 'mucha' : 'normal'}</span>
              </label>
            );
          })}
        </div>
      )}
      {can('goals') && (
        <label>
          Qué quiere tu agente (una meta por línea, hasta {template.max_goals})
          <textarea className="input" rows={3} value={lines(agent.goals)} onChange={(e) => set({ goals: toLines(e.target.value) })} />
        </label>
      )}
      {can('backstory') && (
        <label>
          Su historia
          <textarea className="input" rows={3} maxLength={template.max_text} value={agent.backstory ?? ''} onChange={(e) => set({ backstory: e.target.value })} />
        </label>
      )}
      {can('secrets') && (
        <label>
          Secretos (uno por línea; nadie más los sabrá a menos que tu agente los cuente)
          <textarea className="input" rows={2} value={lines(agent.secrets)} onChange={(e) => set({ secrets: toLines(e.target.value) })} />
        </label>
      )}
      {can('attributes') && (
        <div className="player-block">
          <h4>
            Atributos <span className={left < 0 ? 'bad-text' : 'dim'}>· te quedan {left} de {template.attribute_budget} puntos</span>
          </h4>
          <p className="dim small">Todos empiezan en 10. Subir uno gasta un punto; bajarlo te devuelve uno.</p>
          <div className="player-attrs">
            {ATTRIBUTES.map(([k, short, long]) => {
              const v = agent.attributes?.[k] ?? 10;
              const put = (n: number) => set({ attributes: { ...(agent.attributes ?? {}), [k]: n } });
              return (
                <div key={k} className="player-attr" title={long}>
                  <b>{short}</b>
                  <span>{long}</span>
                  <span className="row nowrap">
                    <button type="button" className="btn" disabled={v <= template.attribute_min} onClick={() => put(v - 1)}>−</button>
                    <strong>{v}</strong>
                    <button type="button" className="btn" disabled={v >= template.attribute_max || left <= 0} onClick={() => put(v + 1)}>+</button>
                    <span className="dim">{signed(modifier(v))}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {can('skills') && (
        <div className="player-block">
          <h4>
            Habilidades <span className="dim">· hasta {template.max_skills}</span>
          </h4>
          <div className="row wrap">
            {Object.entries(SKILLS).map(([k, label]) => {
              const on = (agent.skills ?? []).includes(k);
              const full = (agent.skills ?? []).length >= template.max_skills;
              return (
                <button
                  key={k}
                  type="button"
                  className={`chip-btn ${on ? 'on' : ''}`}
                  disabled={!on && full}
                  onClick={() => set({ skills: on ? (agent.skills ?? []).filter((s) => s !== k) : [...(agent.skills ?? []), k] })}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {fixed.length > 0 && <p className="dim small">Lo decide el DM: {fixed.join(', ')}.</p>}
    </fieldset>
  );
}
