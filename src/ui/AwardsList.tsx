import { awardTitle, type Award } from '../store/awards';

/** The end-of-run awards: a title per person who did most of something. */
export function AwardsList({ awards, me, onPick }: { awards: Award[]; me?: string; onPick?: (agent: string) => void }) {
  if (!awards.length) return null;
  return (
    <div className="awards">
      <strong>🏅 Premios</strong>
      <ul>
        {awards.map((a) => {
          const t = awardTitle(a);
          return (
            <li key={a.key} className={a.agent === me ? 'mine' : ''}>
              <span className="award-icon" aria-hidden>{t.icon}</span>
              <span>
                <b>{t.title}</b>:{' '}
                {onPick ? (
                  <button className="link" onClick={() => onPick(a.agent)}>{a.agent}</button>
                ) : (
                  a.agent
                )}
                <span className="dim"> · {t.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
