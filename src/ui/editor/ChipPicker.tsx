/** Pick several names from a list: chips with ✕ plus an "add…" select. */
export function ChipPicker({
  options,
  value,
  onChange,
  placeholder = '+ añadir…',
  label = (v: string) => v,
}: {
  options: string[];
  value: string[] | undefined;
  onChange: (v: string[]) => void;
  placeholder?: string;
  label?: (v: string) => string;
}) {
  const items = value ?? [];
  const free = options.filter((o) => !items.includes(o));
  return (
    <span className="row wrap chip-picker">
      {items.map((t) => (
        <span key={t} className="chip">
          {label(t)} <button type="button" className="link" onClick={() => onChange(items.filter((x) => x !== t))} aria-label={`Quitar ${t}`}>✕</button>
        </span>
      ))}
      {free.length > 0 && (
        <select className="select" value="" onChange={(e) => e.target.value && onChange([...items, e.target.value])}>
          <option value="">{placeholder}</option>
          {free.map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </select>
      )}
      {!free.length && !items.length && <span className="dim small">(no hay opciones)</span>}
    </span>
  );
}
