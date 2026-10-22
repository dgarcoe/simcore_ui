import { useEffect, useState, type ReactNode } from 'react';
import { authMe, login } from '../api/games';

/** With SIMCORE_DM_PASSWORD set in Simcore, only a dungeon master gets past this screen. */
export function DmGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'in' | 'login'>('checking');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authMe()
      .then((me) => setState(me.dm ? 'in' : 'login'))
      .catch(() => setState('in')); // no Simcore (replays only) or an older one: nothing to protect
  }, []);

  if (state === 'in') return <>{children}</>;
  if (state === 'checking') return null;
  return (
    <main className="start">
      <h1 className="title">
        <span className="brand-mark">◆</span> SIMCORE<span className="brand-dim">·PIXEL</span>
      </h1>
      <section className="card login-card">
        <h2>Dungeon masters</h2>
        <p className="dim">Esta instalación es solo para dungeon masters. Si eres jugador, abre el enlace de tu partida.</p>
        <form
          className="row"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await login(password);
              setState('in');
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <input className="input grow" type="password" autoFocus placeholder="Contraseña de DM" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn btn-accent" type="submit">Entrar</button>
        </form>
        {error && <p className="warn">{error}</p>}
      </section>
    </main>
  );
}
