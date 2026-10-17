import { itemsUsed } from '../../api/scenario';
import { useDraft } from './draft';
import { EffectsEditor } from './EffectsEditor';

const EVENT_TYPES = ['crisis', 'escalation', 'revelation', 'turning_point', 'resolution', 'social_event', 'market_change', 'weather', 'political', 'infrastructure'];

export function EventsTab() {
  const [draft, update] = useDraft();
  const events = draft.events?.scheduled ?? [];
  const agents = draft.agents.map((a) => a.name).filter(Boolean);
  const places = draft.environment.locations.map((l) => l.name).filter(Boolean);
  const items = [...new Set([...Object.keys(draft.items ?? {}), ...itemsUsed(draft)])].sort();

  return (
    <div className="ed-section">
      <div className="row between">
        <h3>Sucesos programados</h3>
        <button
          className="btn"
          onClick={() =>
            update((d) => {
              const list = ((d.events ??= {}).scheduled ??= []);
              const last = list.reduce((m, e) => Math.max(m, e.tick), 0);
              list.push({ tick: last + 6, type: 'crisis', description: '' });
            })
          }
        >
          + Suceso
        </button>
      </div>
      <p className="dim small">Cada tick es un paso de tiempo (por defecto, 1 hora). Durante la simulación también puedes inyectar sucesos a mano.</p>
      {events.length === 0 && <p className="empty">Sin sucesos programados.</p>}
      {events.map((e, i) => (
        <article key={i} className="ed-card">
          <div className="row">
            <label className="row">
              Tick
              <input
                className="input tiny"
                type="number"
                min={0}
                value={e.tick}
                onChange={(ev) => update((d) => void (d.events!.scheduled![i].tick = Math.max(0, Number(ev.target.value) || 0)))}
              />
            </label>
            <input
              className="input grow"
              list="event-types"
              value={e.type}
              onChange={(ev) => update((d) => void (d.events!.scheduled![i].type = ev.target.value))}
            />
            <button className="btn" title="Eliminar suceso" onClick={() => update((d) => void d.events!.scheduled!.splice(i, 1))}>✕</button>
          </div>
          <textarea
            className="input"
            rows={2}
            placeholder="Qué ocurre (todos los agentes lo perciben)"
            value={e.description}
            onChange={(ev) => update((d) => void (d.events!.scheduled![i].description = ev.target.value))}
          />
          <EffectsEditor
            effects={e.effects}
            agents={agents}
            places={places}
            items={items}
            onChange={(fx) =>
              update((d) => {
                const ev = d.events!.scheduled![i];
                if (fx) ev.effects = fx;
                else delete ev.effects;
              })
            }
          />
        </article>
      ))}
      <datalist id="event-types">{EVENT_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
    </div>
  );
}
