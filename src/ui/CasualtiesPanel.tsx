import { useMemo, useState } from 'react';
import { cap, useWords } from '../lib/words';
import { bus } from '../store/bus';
import { groupCasualties, rivalries } from '../store/casualties';
import { useSim } from '../store/simStore';

type Sort = 'downed' | 'fell' | 'hospital';

/** Who downed whom: per person, per group, nemeses and causes. */
export function CasualtiesPanel() {
  const c = useSim((s) => s.casualties);
  const factions = useSim((s) => s.sim?.society?.factions);
  const agents = useSim((s) => s.sim?.agents);
  const select = useSim((s) => s.selectAgent);
  const w = useWords();
  const [sort, setSort] = useState<Sort>('downed');
  const people = useMemo(
    () =>
      Object.entries(c.people)
        .map(([name, p]) => ({ name, ...p, fellAll: p.fell + p.deaths }))
        .sort((a, b) => (sort === 'downed' ? b.downed - a.downed || a.fellAll - b.fellAll : sort === 'fell' ? b.fellAll - a.fellAll || b.hospital - a.hospital : b.hospital - a.hospital))
        .slice(0, 20),
    [c, sort],
  );
  const groups = factions ? groupCasualties(c, factions) : [];
  const rivals = rivalries(c).slice(0, 8);
  const causes = Object.entries(c.causes).sort((a, b) => b[1] - a[1]);
  const total = causes.reduce((n, [, v]) => n + v, 0);
  const inBed = Object.values(agents ?? {}).filter((a) => a.recovering);
  const pick = (n: string) => {
    select(n);
    bus.emit('focusAgent', n);
  };

  if (!people.length && !inBed.length)
    return (
      <div className="panel-body">
        <p className="dim">Aún no ha caído nadie.</p>
      </div>
    );

  return (
    <div className="panel-body casualties">
      {inBed.length > 0 && (
        <section>
          <h4>🏥 Recuperándose ahora</h4>
          <ul className="plain">
            {inBed.map((a) => (
              <li key={a.name}>
                <button className="link" onClick={() => pick(a.name)}>{a.name}</button>{' '}
                <span className="dim">
                  · {a.recovering!.why === 'knockout' ? 'K.O.' : 'agotado'} · {a.recovering!.left} {a.recovering!.left === 1 ? 'turno' : 'turnos'} · {a.location}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <div className="row between">
          <h4>⚔ Clasificación</h4>
          <select className="select small" aria-label="Ordenar por" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="downed">Más rivales tumbados</option>
            <option value="fell">Más veces caído</option>
            <option value="hospital">Más turnos en el hospital</option>
          </select>
        </div>
        <table className="tally">
          <thead>
            <tr>
              <th scope="col">Quién</th>
              <th scope="col" title="Rivales que ha tumbado o matado">Tumba</th>
              <th scope="col" title="Veces que ha caído (K.O. o muerte)">Cae</th>
              <th scope="col" title="Veces que se ha desplomado de cansancio">Rendido</th>
              <th scope="col" title="Turnos recuperándose">Hospital</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.name}>
                <td>
                  <button className="link" onClick={() => pick(p.name)}>{p.name}</button>
                </td>
                <td>{p.downed || ''}</td>
                <td>{p.fellAll ? `${p.fellAll}${p.deaths ? ' ✝' : ''}` : ''}</td>
                <td>{p.exhausted || ''}</td>
                <td>{p.hospital || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {groups.length > 0 && (
        <section>
          <h4>🏴 Por {w.group}</h4>
          <table className="tally">
            <thead>
              <tr>
                <th scope="col">{cap(w.group)}</th>
                <th scope="col">Tumba</th>
                <th scope="col">Sufre</th>
                <th scope="col">Hospital</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.group}>
                  <td>
                    <i className="swatch" style={{ background: g.color || '#94b0c2' }} /> {g.group}
                  </td>
                  <td>{g.downed}</td>
                  <td>{g.suffered}</td>
                  <td>{g.hospital}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {rivals.length > 0 && (
        <section>
          <h4>😠 Némesis</h4>
          <ul className="plain">
            {rivals.map((r) => (
              <li key={`${r.by}-${r.victim}`}>
                <button className="link" onClick={() => pick(r.by)}>{r.by}</button> → <button className="link" onClick={() => pick(r.victim)}>{r.victim}</button>{' '}
                <span className="dim">×{r.times}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {causes.length > 0 && (
        <section>
          <h4>💥 Causas</h4>
          <ul className="plain causes">
            {causes.map(([cause, n]) => (
              <li key={cause}>
                <span>{cause}</span>
                <span className="bar" aria-hidden>
                  <span style={{ width: `${Math.round((n / total) * 100)}%` }} />
                </span>
                <span className="dim">{n}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
