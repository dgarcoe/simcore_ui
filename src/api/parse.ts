// Simcore events carry agent actions as the English text produced by
// `Action.describe()` (simcore/agents/actions.py). This turns that text back
// into a structured action so the UI can tell who is talking to whom.

export type ParsedAction =
  | { kind: 'move'; target: string }
  | { kind: 'speak'; target: string; content: string }
  | { kind: 'trade'; target: string; content: string }
  | { kind: 'interact'; target: string; content: string }
  | { kind: 'work'; content: string }
  | { kind: 'post'; content: string }
  | { kind: 'observe'; target: string }
  | { kind: 'rest' }
  | { kind: 'wait' }
  | { kind: 'custom'; content: string };

const PATTERNS: Array<[RegExp, (m: RegExpMatchArray) => ParsedAction]> = [
  [/^moves to (.+)$/s, (m) => ({ kind: 'move', target: m[1].trim() })],
  [/^says to (.+?): "(.*)"$/s, (m) => ({ kind: 'speak', target: m[1].trim(), content: m[2] })],
  [/^trades with (.+?): (.*)$/s, (m) => ({ kind: 'trade', target: m[1].trim(), content: m[2] })],
  [/^interacts with (.+?): (.*)$/s, (m) => ({ kind: 'interact', target: m[1].trim(), content: m[2] })],
  [/^works: ?(.*)$/s, (m) => ({ kind: 'work', content: m[1] })],
  [/^posts online: ?(.*)$/s, (m) => ({ kind: 'post', content: m[1] })],
  [/^observes (.+)$/s, (m) => ({ kind: 'observe', target: m[1] === 'surroundings' ? '' : m[1] })],
  [/^rests$/, () => ({ kind: 'rest' })],
  [/^waits$/, () => ({ kind: 'wait' })],
];

export function parseAction(text: string | null | undefined): ParsedAction {
  const s = (text ?? '').trim();
  for (const [re, build] of PATTERNS) {
    const m = s.match(re);
    if (m) return build(m);
  }
  return { kind: 'custom', content: s };
}

/** `interaction` events only carry `result`, e.g. "A trades with B: offer". */
export function parseInteraction(
  result: string,
): { initiator: string; target: string; kind: 'trade' | 'interact' | 'speak'; content: string } | null {
  const m = result.match(/^(.+?) (trades with|interacts with|says to) (.+?): (.*)$/s);
  if (!m) return null;
  const kind = m[2] === 'trades with' ? 'trade' : m[2] === 'interacts with' ? 'interact' : 'speak';
  const content = kind === 'speak' ? m[4].replace(/^"(.*)"$/s, '$1') : m[4];
  return { initiator: m[1], target: m[3], kind, content };
}
