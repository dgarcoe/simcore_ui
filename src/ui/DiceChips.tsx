import { diceText, type DiceRoll } from '../store/rpg';

/** «🎲 16 vs 12 ✓» for each roll an action or a line needed; the whole roll on hover. */
export function DiceChips({ rolls }: { rolls?: DiceRoll[] }) {
  if (!rolls?.length) return null;
  return (
    <span className="dice-chips">
      {rolls.map((d, i) => {
        const versus = d.against ? d.against.total : (d.dc ?? 10);
        const mark = d.critical ? '💥' : d.fumble ? '💀' : d.success ? '✓' : '✗';
        return (
          <span key={i} className={`dice-chip ${d.critical ? 'crit' : d.success ? 'ok' : 'ko'}`} title={diceText(d)}>
            🎲 {d.total} vs {versus} {mark}
          </span>
        );
      })}
    </span>
  );
}
