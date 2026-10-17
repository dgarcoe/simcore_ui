import { useState } from 'react';

export function amountsToText(r: Record<string, number> | undefined): string {
  return Object.entries(r ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

export function textToAmounts(t: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of t.split('\n')) {
    const m = line.match(/^\s*([^:=]+?)\s*[:=]\s*(-?[\d.]+)\s*$/);
    if (m) out[m[1]] = Number(m[2]);
  }
  return out;
}

/** "item: amount" lines (inventories, stock, production). Edited as text so half-typed lines survive; parsed on blur. */
export function AmountsField({
  label,
  value,
  onChange,
  placeholder = 'medicine: 2\nfood: 5',
}: {
  label: React.ReactNode;
  value?: Record<string, number>;
  onChange: (r: Record<string, number>) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(amountsToText(value));
  return (
    <label>
      <span>{label}</span>
      <textarea
        className="input"
        rows={2}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange(textToAmounts(text))}
      />
    </label>
  );
}
