import { useState } from 'react';
import * as api from '../api/client';
import type { SimEvent } from '../api/types';
import { summarizeRun, type RunSummary } from '../store/review';

interface Option {
  key: string;
  label: string;
}

type Loaded = { events: SimEvent[]; config?: Parameters<typeof summarizeRun>[2]; meta?: { model?: string; demo?: boolean } };

async function load(key: string): Promise<Loaded> {
  if (key.startsWith('f:')) return (await (await fetch(`/fixtures/${key.slice(2)}`)).json()) as Loaded;
  return (await api.fetchRun(key.slice(2))) as unknown as Loaded;
}

/** Two runs side by side: who won, what agents did, how healthy the LLM was, which orders paid. */
export function CompareSection({ fixtures, runs }: { fixtures: Array<{ file: string; name: string }>; runs: api.RunMeta[] | null }) {
  const options: Option[] = [
    ...(runs ?? []).filter((r) => r.status !== 'running' && r.events > 0).map((r) => ({ key: `r:${r.id}`, label: `${r.name} · ${r.started.slice(0, 16).replace('T', ' ')} · ${r.demo ? 'demo' : r.model}` })),
    ...fixtures.map((f) => ({ key: `f:${f.file}`, label: `${f.name} (repetición)` })),
  ];
  const [pick, setPick] = useState<[string, string]>(['', '']);
  const [result, setResult] = useState<[RunSummary, RunSummary] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (options.length < 2) return null;

  const compare = async () => {
    setBusy(true);
    setError(null);
    try {
      const both = await Promise.all(pick.map(load));
      setResult(
        both.map((f, i) => summarizeRun(options.find((o) => o.key === pick[i])?.label ?? '', f.events, f.config, f.meta?.demo ? 'demo' : (f.meta?.model ?? ''))) as [RunSummary, RunSummary],
      );
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const pct = (s: RunSummary) => (s.decisions ? `${Math.round((s.useful / s.decisions) * 100)} %` : '—');
  const styles = result ? [...new Set(result.flatMap((r) => Object.keys(r.styles)))].sort() : [];

  return (
    <section className="card">
      <h2>⚖ Comparar dos partidas</h2>
      <p className="dim">El mismo escenario con otra semilla u otro modelo: quién gana, qué hacen los agentes y si el LLM responde bien.</p>
      <div className="row wrap">
        {[0, 1].map((i) => (
          <select key={i} className="select" aria-label={`Partida ${i + 1}`} value={pick[i]} onChange={(e) => setPick((p) => (i ? [p[0], e.target.value] : [e.target.value, p[1]]))}>
            <option value="">— Partida {i + 1} —</option>
            {options.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        ))}
        <button className="btn btn-accent" disabled={busy || !pick[0] || !pick[1] || pick[0] === pick[1]} onClick={compare}>
          {busy ? 'Cargando…' : 'Comparar'}
        </button>
      </div>
      {error && <p className="warn">{error}</p>}
      {result && (
        <div className="compare">
          <table>
            <thead>
              <tr>
                <th />
                {result.map((r, i) => (
                  <th key={i}>{r.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row label="Modelo" cells={result.map((r) => r.model || '—')} />
              <Row label="Duración" cells={result.map((r) => `${r.ticks} ticks`)} />
              <Row label="Final" cells={result.map((r) => r.ending || '—')} />
              <Row label="👑 Gana" cells={result.map((r) => r.winner || '—')} />
              <Row label="⭐ Más puntos" cells={result.map((r) => r.mvp || '—')} />
              <Row label="Decisiones útiles" cells={result.map((r) => `${pct(r)} de ${r.decisions}${r.parseErrors ? ` · ${r.parseErrors} respuestas ilegibles` : ''}`)} />
              <Row label="Acciones más usadas" cells={result.map((r) => r.actions.map(([a, n]) => `${a} ${n}`).join(' · '))} />
              <Row label="Territorios que cambian de manos" cells={result.map((r) => String(r.captures))} />
              <Row label="K.O. / muertes" cells={result.map((r) => `${r.knockouts} / ${r.deaths}`)} />
              <Row label="Grupos" cells={result.map((r) => r.groups.map((g, i) => `${i + 1}. ${g.group} (${g.points})`).join(' · ') || '—')} />
              <Row label="Top 5" cells={result.map((r) => r.top.map((t) => `${t.agent} ${t.points}`).join(' · ') || '—')} />
              {styles.map((s) => (
                <Row key={s} label={`Media de puntos: ${s}`} cells={result.map((r) => (r.styles[s] !== undefined ? String(r.styles[s]) : '—'))} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Row({ label, cells }: { label: string; cells: string[] }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      {cells.map((c, i) => (
        <td key={i}>{c}</td>
      ))}
    </tr>
  );
}
