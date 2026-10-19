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
  | { kind: 'give'; target: string; item: string; amount: number }
  | { kind: 'take'; item: string; amount: number }
  | { kind: 'drop'; item: string; amount: number }
  | { kind: 'use'; item: string; target: string }
  | { kind: 'offer'; target: string; item: string; amount: number; askItem: string; askAmount: number }
  | { kind: 'accept'; target: string }
  | { kind: 'decline'; target: string }
  | { kind: 'whisper'; target: string; content: string }
  | { kind: 'invite'; target: string; place: string; content: string }
  | { kind: 'follow'; target: string }
  | { kind: 'find'; target: string }
  | { kind: 'attack'; target: string }
  | { kind: 'heal'; target: string }
  | { kind: 'found_group'; group: string }
  | { kind: 'join'; group: string }
  | { kind: 'leave'; group: string }
  | { kind: 'expel'; target: string }
  | { kind: 'call_vote'; question: string }
  | { kind: 'vote'; option: string }
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
  [/^gives (.+?) ([\d.]+) (\S.*)$/s, (m) => ({ kind: 'give', target: m[1], amount: Number(m[2]), item: m[3] })],
  [/^takes ([\d.]+) (\S.*)$/s, (m) => ({ kind: 'take', amount: Number(m[1]), item: m[2] })],
  [/^leaves ([\d.]+) (\S.*) here$/s, (m) => ({ kind: 'drop', amount: Number(m[1]), item: m[2] })],
  [/^uses (\S.*?)(?: on (.+))?$/s, (m) => ({ kind: 'use', item: m[1], target: m[2] ?? '' })],
  [
    /^offers (.+?) ([\d.]+) (\S+?)(?: for ([\d.]+) (\S.*))?$/s,
    (m) => ({ kind: 'offer', target: m[1], amount: Number(m[2]), item: m[3], askAmount: Number(m[4] ?? 0), askItem: m[5] ?? '' }),
  ],
  [/^accepts the offer from (.+)$/s, (m) => ({ kind: 'accept', target: m[1] })],
  [/^declines the offer from (.+)$/s, (m) => ({ kind: 'decline', target: m[1] })],
  [/^whispers to (.+?): "(.*)"$/s, (m) => ({ kind: 'whisper', target: m[1].trim(), content: m[2] })],
  [
    /^invites (.+?) to (.+?)(?:: "(.*)")?$/s,
    (m) => ({ kind: 'invite', target: m[1].trim(), place: m[2].trim(), content: m[3] ?? '' }),
  ],
  [/^follows (.+)$/s, (m) => ({ kind: 'follow', target: m[1].trim() })],
  [/^looks for (.+)$/s, (m) => ({ kind: 'find', target: m[1].trim() })],
  [/^attacks (.+)$/s, (m) => ({ kind: 'attack', target: m[1].trim() })],
  [/^heals themself$/, () => ({ kind: 'heal', target: '' })],
  [/^heals (.+)$/s, (m) => ({ kind: 'heal', target: m[1].trim() })],
  [/^founds the group "(.*)"$/s, (m) => ({ kind: 'found_group', group: m[1] })],
  [/^joins (.+)$/s, (m) => ({ kind: 'join', group: m[1].trim() })],
  [/^leaves their group$/, () => ({ kind: 'leave', group: '' })],
  [/^leaves (?!\d)(.+)$/s, (m) => ({ kind: 'leave', group: m[1].trim() })],
  [/^expels (.+)$/s, (m) => ({ kind: 'expel', target: m[1].trim() })],
  [/^calls a vote: "(.*)"$/s, (m) => ({ kind: 'call_vote', question: m[1] })],
  [/^votes "(.*)"$/s, (m) => ({ kind: 'vote', option: m[1] })],
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

/** Everyone a speech or interaction is aimed at: the engine's `targets` list, or "Ana, Bob" split. */
export function targetsOf(data: Record<string, unknown>, target: string): string[] {
  const list = data.targets;
  if (Array.isArray(list) && list.length) return list.map(String);
  return target.split(/\s*,\s*/).filter(Boolean);
}
