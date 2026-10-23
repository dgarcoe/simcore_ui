// Pure reducer that turns the raw Simcore event stream into UI-friendly
// state: current snapshot, activity feed, conversations, posts, banners.

import { parseAction, parseInteraction, targetsOf, type ParsedAction } from '../api/parse';
import { FRAME_LIMIT, MOMENT_LIMIT, relFrame, scoreEvent, type Chapter, type Moment, type RelFrame } from './story';
import { diceText, levelText, type DiceRoll, type LevelUp } from './rpg';
import type { Agent, EventType, SimEvent, SimState } from '../api/types';

export interface FeedItem {
  id: number;
  tick: number;
  type: EventType;
  source: string;
  text: string;
  action?: ParsedAction;
  /** Why the agent did it (the LLM's reasoning, or Simcore's note). */
  reasoning?: string;
  /** A die roll: the roll itself, and the action, speech or search it was for. */
  dice?: DiceRoll;
  link?: number;
  /** The rolls this action, speech or search needed. */
  rolls?: DiceRoll[];
}

export type ChatKind = 'speak' | 'trade' | 'interact' | 'whisper' | 'invite';

export interface ChatLine {
  tick: number;
  speaker: string;
  target: string;
  kind: ChatKind;
  text: string;
  /** Persuade / intimidate / deceive rolls this line needed. */
  rolls?: DiceRoll[];
}

export interface Conversation {
  id: string;
  participants: [string, string];
  location: string;
  startTick: number;
  lastTick: number;
  lines: ChatLine[];
}

export interface Post {
  tick: number;
  author: string;
  text: string;
}

export interface Banner {
  id: number;
  tick: number;
  kind: 'scheduled' | 'injected' | 'end' | 'death' | 'arrival' | 'transform' | 'vote' | 'level';
  text: string;
  location: string;
}

export type RunStatus = 'idle' | 'running' | 'ended';

/** What Simcore is doing for agent decisions: demo mock, a real LLM, or a failing LLM. */
export interface LlmStatus {
  mode: 'unknown' | 'demo' | 'llm';
  calls: number;
  cacheHits: number;
  /** Decisions that came back as `LLM error: …` since the run started. */
  errors: number;
  lastError: string;
  lastErrorTick: number;
  /** Consecutive ticks in which every decision failed. */
  failingTicks: number;
  /** What made the last failing tick fail: the call itself or an unusable answer. */
  failKind: 'llm' | 'parse';
  /** Answers Simcore could not parse (the model ignored the JSON format). */
  parseErrors: number;
  lastParseError: string;
  /** Parse errors in the last finished tick, and how many decisions it had. */
  lastTickParseErrors: number;
  lastTickDecisions: number;
  tickDecisions: number;
  tickErrors: number;
  tickParseErrors: number;
}

export function initialLlm(): LlmStatus {
  return {
    mode: 'unknown',
    calls: 0,
    cacheHits: 0,
    errors: 0,
    lastError: '',
    lastErrorTick: -1,
    failingTicks: 0,
    failKind: 'llm',
    parseErrors: 0,
    lastParseError: '',
    lastTickParseErrors: 0,
    lastTickDecisions: 0,
    tickDecisions: 0,
    tickErrors: 0,
    tickParseErrors: 0,
  };
}

// "LLM failed after N attempts:" comes from Simcore forks that retry.
const LLM_ERROR = /^(LLM error|LLM failed after \d+ attempts):\s*/;
const PARSE_ERROR = /^Parse error:\s*/;

/** Progress of the tick being computed: who has already decided. */
export interface TickProgress {
  tick: number;
  phase: 'idle' | 'deciding' | 'reflecting';
  decided: string[];
}

export interface SimSnapshot {
  sim: SimState | null;
  /**
   * False from a simulation_start until the new run's first state arrives: `sim` still holds the
   * previous run (kept so the map doesn't flash empty), so its clock and agents must not be shown.
   */
  simFresh: boolean;
  scenarioName: string;
  status: RunStatus;
  feed: FeedItem[];
  conversations: Conversation[];
  posts: Post[];
  reflections: Record<string, { tick: number; text: string }[]>;
  banner: Banner | null;
  llm: LlmStatus;
  /** Last tick of the current run (-1 = unknown, e.g. joined mid-run). */
  lastTick: number;
  /** Agent names of the current run, once known. */
  runAgents: string[] | null;
  /** max_ticks of the current run, once a tick of it has been seen. */
  runMaxTicks: number | null;
  /** Set when this UI asked Simcore to stop, so an early simulation_end is expected. */
  stopRequested: boolean;
  /** Why the run ended (Simcore versions that report it): completed, stopped, no_agents_left. */
  endReason: string;
  /** Text of the rule that ended the run, if any. */
  endMessage: string;
  progress: TickProgress;
  /** Latest decision of each agent with its reasoning. */
  reasoning: Record<string, { tick: number; action: string; text: string }>;
  seq: number;
  recent: SimEvent[];
  /** Key moments of the run (computed from the events). */
  moments: Moment[];
  /** Chronicle chapters written by Simcore's narrator. */
  chapters: Chapter[];
  /** Relationships at each tick, for the graph. */
  relFrames: RelFrame[];
  /** The narrator's closing text, once asked for (end card). */
  epilogue: string;
  /** Latest d20 rolls of each agent (role-playing rules). */
  rolls: Record<string, DiceRoll[]>;
  /** Feed ids of each agent's rolls waiting for the action that caused them (same tick). */
  pendingRolls: Record<string, { tick: number; ids: number[] }>;
}

export const FEED_LIMIT = 400;
export const ROLL_LIMIT = 8;
export const CONVERSATION_LIMIT = 150;
/** A new conversation starts when a pair has been silent for this many ticks. */
export const CONVERSATION_GAP = 3;

export function initialSnapshot(): SimSnapshot {
  return {
    sim: null,
    simFresh: true,
    scenarioName: '',
    status: 'idle',
    feed: [],
    conversations: [],
    posts: [],
    reflections: {},
    banner: null,
    llm: initialLlm(),
    lastTick: -1,
    runAgents: null,
    runMaxTicks: null,
    stopRequested: false,
    endReason: '',
    endMessage: '',
    progress: { tick: 0, phase: 'idle', decided: [] },
    reasoning: {},
    seq: 0,
    recent: [],
    moments: [],
    chapters: [],
    relFrames: [],
    epilogue: '',
    rolls: {},
    pendingRolls: {},
  };
}

/** Dead and departed agents no longer act (Simcore versions without health: everyone is alive). */
export function isAlive(a: Agent): boolean {
  const status = a.status ?? a.state?.status;
  return !status || status === 'alive';
}

/** True when Simcore reports health, i.e. supports deaths, arrivals and effects. */
export function hasLifecycle(sim: SimState | null): boolean {
  return !!sim && Object.values(sim.agents).some((a) => typeof a.state?.health === 'number');
}

export function agentByName(sim: SimState | null, name: string): Agent | undefined {
  if (!sim) return undefined;
  const key = name.toLowerCase().trim();
  return Object.values(sim.agents).find((a) => a.name.toLowerCase() === key || a.id === key);
}

function isDuplicate(recent: SimEvent[], e: SimEvent): boolean {
  return recent.some(
    (r) => r.tick === e.tick && r.type === e.type && r.source === e.source && JSON.stringify(r.data) === JSON.stringify(e.data),
  );
}

function namesOf(state: SimState): string[] | null {
  const names = Object.values(state.agents ?? {}).map((a) => a.name);
  return names.length ? names : null;
}

const AGENT_EVENTS = new Set<string>(['agent_speak', 'agent_move', 'agent_action', 'agent_post', 'interaction', 'reflection']);

/**
 * When a new scenario is launched, Simcore asks the old engine to stop, but a
 * tick already waiting on a slow LLM still finishes and its events (tick_end,
 * actions, simulation_end) arrive after the new simulation_start. Events that
 * jump ahead of the current run or come from agents not in it are leftovers.
 */
export function isStale(s: SimSnapshot, e: SimEvent): boolean {
  if (e.type === 'simulation_start' || s.lastTick < 0) return false;
  if (e.tick > s.lastTick + 1) return true;
  // A run only ends early when someone stops it; otherwise at its last tick.
  // (Simcore versions with a `reason` also end early when nobody is left.)
  if (
    e.type === 'simulation_end' &&
    !s.stopRequested &&
    e.data.reason !== 'no_agents_left' &&
    e.data.reason !== 'rule' &&
    (s.runMaxTicks === null || e.tick < s.runMaxTicks)
  )
    return true;
  if (!s.runAgents?.length) return false;
  if (AGENT_EVENTS.has(e.type) && e.source && !s.runAgents.includes(e.source)) return true;
  if (e.type === 'tick_end') {
    const names = Object.values((e.data as SimState).agents ?? {}).map((a) => a.name);
    return names.length > 0 && names.some((n) => !s.runAgents!.includes(n));
  }
  return false;
}

/** Returns null when the event is a duplicate or a leftover and must be ignored. */
export function reduce(s: SimSnapshot, e: SimEvent): SimSnapshot | null {
  const next = reduceEvent(s, e);
  return next && linkRolls(s, next, e);
}

const ROLL_CAUSES = new Set(['agent_action', 'agent_speak', 'agent_search']);

/**
 * Simcore emits a roll right before the action, speech or search of the same agent that needed it,
 * in the same tick: tie them together, both ways.
 */
function linkRolls(prev: SimSnapshot, next: SimSnapshot, e: SimEvent): SimSnapshot {
  const last = next.feed.at(-1);
  const added = last && last !== prev.feed.at(-1) ? last : undefined;
  if (e.type === 'dice_roll' && added?.dice) {
    const who = added.source;
    const was = next.pendingRolls[who];
    const ids = was && was.tick === e.tick ? [...was.ids, added.id] : [added.id];
    return { ...next, pendingRolls: { ...next.pendingRolls, [who]: { tick: e.tick, ids } } };
  }
  const waiting = next.pendingRolls[e.source];
  if (!ROLL_CAUSES.has(e.type) || !waiting) return next;
  const { [e.source]: _, ...rest } = next.pendingRolls;
  if (waiting.tick !== e.tick || !added || added.source !== e.source) return { ...next, pendingRolls: rest };
  const label = added.text.length > 70 ? `${added.text.slice(0, 69)}…` : added.text;
  const dice: DiceRoll[] = [];
  const feed = next.feed.map((f) => {
    if (!waiting.ids.includes(f.id) || !f.dice) return f;
    const d = { ...f.dice, for: label };
    dice.push(d);
    return { ...f, dice: d, link: added.id, text: `${f.text} · por «${label}»` };
  });
  feed[feed.length - 1] = { ...added, rolls: dice };
  const rolls = (next.rolls[e.source] ?? []).map((r) => (r.tick === e.tick && !r.for && dice.some((d) => d.check === r.check && d.roll === r.roll && d.target === r.target) ? { ...r, for: label } : r));
  let conversations = next.conversations;
  if (e.type === 'agent_speak') {
    conversations = conversations.map((c) =>
      c.lastTick !== e.tick || !c.participants.includes(e.source)
        ? c
        : { ...c, lines: c.lines.map((l) => (l.tick === e.tick && l.speaker === e.source && !l.rolls && dice.some((d) => d.target === l.target) ? { ...l, rolls: dice.filter((d) => d.target === l.target) } : l)) },
    );
  }
  return { ...next, feed, rolls: { ...next.rolls, [e.source]: rolls }, conversations, pendingRolls: rest };
}

function reduceEvent(s: SimSnapshot, e: SimEvent): SimSnapshot | null {
  // A relaunched scenario repeats its simulation_start verbatim: never a duplicate.
  if (e.type !== 'tick_end' && e.type !== 'simulation_start' && isDuplicate(s.recent, e)) return null;
  if (isStale(s, e)) return null;
  const recent = e.type === 'tick_end' ? s.recent : [...s.recent.slice(-30), e];
  const seq = s.seq + 1;
  let next: SimSnapshot = { ...s, recent, seq };
  const moment = scoreEvent(e);
  if (moment) next = { ...next, moments: [...next.moments.slice(-(MOMENT_LIMIT - 1)), moment] };

  switch (e.type) {
    case 'simulation_start':
      return {
        ...initialSnapshot(),
        sim: s.sim,
        simFresh: !s.sim,
        scenarioName: String(e.data.config ?? ''),
        status: 'running',
        lastTick: 0,
        seq,
        recent: [e],
        feed: [feedItem(seq, e, `▶ ${e.data.config ?? 'Simulation'} started`)],
      };
    case 'simulation_end': {
      const text =
        e.data.reason === 'no_agents_left'
          ? 'No queda nadie: la simulación termina'
          : e.data.reason === 'rule' && e.data.message
            ? String(e.data.message)
            : 'Simulation finished';
      return {
        ...next,
        status: 'ended',
        endReason: String(e.data.reason ?? ''),
        endMessage: String(e.data.message ?? ''),
        banner: { id: seq, tick: e.tick, kind: 'end', text, location: '' },
        feed: pushFeed(next.feed, feedItem(seq, e, `■ ${text}`)),
      };
    }
    case 'agent_spawn':
    case 'agent_death':
    case 'agent_depart': {
      const where = String(e.data.location ?? '');
      const cause = String(e.data.cause ?? '');
      const name = e.source || String(e.data.agent ?? '');
      const text =
        e.type === 'agent_spawn'
          ? `llega${e.data.profession ? ` (${e.data.profession})` : ''}${where ? ` a ${where}` : ''}`
          : e.type === 'agent_death'
            ? `ha muerto${where ? ` en ${where}` : ''}`
            : `se marcha${where ? ` de ${where}` : ''}`;
      next = {
        ...next,
        feed: pushFeed(next.feed, { ...feedItem(seq, e, text), source: name, reasoning: cause || undefined }),
        // Newcomers belong to this run: keep isStale from dropping their events.
        runAgents: e.type === 'agent_spawn' && s.runAgents && !s.runAgents.includes(name) ? [...s.runAgents, name] : s.runAgents,
      };
      if (e.type === 'agent_depart') return next;
      return {
        ...next,
        banner: {
          id: seq,
          tick: e.tick,
          kind: e.type === 'agent_death' ? 'death' : 'arrival',
          text: `${name} ${e.type === 'agent_death' ? 'ha muerto' : 'ha llegado'}${cause && e.type === 'agent_death' ? `: ${cause}` : ''}`,
          location: where,
        },
      };
    }
    case 'item_transfer': {
      // give/take/drop/use/trade already show as the agent's action; only report what has no action.
      const text = transferText(e.data);
      return text ? { ...next, feed: pushFeed(next.feed, { ...feedItem(seq, e, text), source: '' }) } : next;
    }
    case 'trade_offer':
      return next;
    case 'need_change': {
      const { label, need, level } = e.data as Record<string, string>;
      const name = label || need;
      const text = level === 'critical' ? `${name}: crítico` : level === 'high' ? `${name}: alto` : `${name}: satisfecho`;
      return { ...next, feed: pushFeed(next.feed, { ...feedItem(seq, e, text), reasoning: e.data.cause ? String(e.data.cause) : undefined }) };
    }
    case 'place_change': {
      const d = e.data as { location: string; closed?: boolean; hazard?: { label?: string } | null };
      const text = `${d.location}: ${d.closed ? 'cerrado' : 'abierto'}${d.hazard ? ` · ${d.hazard.label || 'peligro'}` : ''}`;
      return { ...next, feed: pushFeed(next.feed, { ...feedItem(seq, e, text), source: '' }) };
    }
    case 'rule_fired': {
      const text = String(e.data.description ?? '');
      if (!text) return next;
      return {
        ...next,
        feed: pushFeed(next.feed, feedItem(seq, e, text)),
        banner: { id: seq, tick: e.tick, kind: 'scheduled', text, location: '' },
      };
    }
    case 'agent_plan': {
      const steps = (e.data.steps ?? []) as string[];
      const text = `planea: ${steps.map((s, i) => `${i + 1}) ${s}`).join(' ')}`;
      return { ...next, feed: pushFeed(next.feed, { ...feedItem(seq, e, text), reasoning: e.data.reason ? String(e.data.reason) : undefined }) };
    }
    case 'story_chapter': {
      const c = e.data as unknown as Chapter;
      return { ...next, chapters: [...next.chapters, c], feed: pushFeed(next.feed, feedItem(seq, e, `📖 ${c.title}`)) };
    }
    case 'story_moment':
      return next; // already a moment (computed above) and its event has its own feed line
    case 'faction_change': {
      const text = factionText(e.data as unknown as FactionData);
      return { ...next, feed: pushFeed(next.feed, feedItem(seq, e, text)) };
    }
    case 'vote_called':
      return { ...next, feed: pushFeed(next.feed, feedItem(seq, e, `convoca una votación en ${String(e.data.place ?? '')}: «${String(e.data.question ?? '')}» (${((e.data.options ?? []) as string[]).join(' / ')})`)) };
    case 'vote_result': {
      const counts = (e.data.counts ?? {}) as Record<string, number>;
      const tally = Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ');
      const verdict = e.data.winner ? `gana «${String(e.data.winner)}»` : 'sin decisión';
      const text = `Votación «${String(e.data.question ?? '')}»: ${verdict} (${tally})`;
      return {
        ...next,
        feed: pushFeed(next.feed, feedItem(seq, e, `🗳 ${text}`)),
        banner: { id: seq, tick: e.tick, kind: 'vote', text, location: String(e.data.place ?? '') },
      };
    }
    case 'dice_roll': {
      const d = { ...(e.data as unknown as DiceRoll), tick: e.tick };
      const who = d.agent || e.source;
      const mine = [...(next.rolls[who] ?? []).slice(-(ROLL_LIMIT - 1)), d];
      return { ...next, rolls: { ...next.rolls, [who]: mine }, feed: pushFeed(next.feed, { ...feedItem(seq, e, diceText(d)), source: who, dice: d }) };
    }
    case 'level_up': {
      const d = e.data as unknown as LevelUp;
      const who = d.agent || e.source;
      return {
        ...next,
        feed: pushFeed(next.feed, { ...feedItem(seq, e, levelText(d)), source: who }),
        banner: { id: seq, tick: e.tick, kind: 'level', text: `${who}: ¡NIVEL ${d.level}!`, location: '' },
      };
    }
    case 'agent_search': {
      const text = searchText(e.data as SearchData);
      return text ? { ...next, feed: pushFeed(next.feed, feedItem(seq, e, text)) } : next;
    }
    case 'speech_ignored': {
      const d = e.data as { agent: string; text: string; turns: number };
      const text = `no le contesta a ${d.agent} (${d.turns} turnos): «${d.text}»`;
      return { ...next, feed: pushFeed(next.feed, feedItem(seq, e, text)) };
    }
    case 'belief_shared': {
      const d = e.data as { from: string; to: string; text: string; truth: boolean | null; secret: boolean };
      const mark = d.secret ? ' (secreto revelado)' : d.truth === false ? ' (falso)' : d.truth === true ? ' (cierto)' : '';
      const text = d.from ? `le cuenta a ${d.to}: «${d.text}»${mark}` : `oye un rumor: «${d.text}»${mark}`;
      return { ...next, feed: pushFeed(next.feed, { ...feedItem(seq, e, text), source: d.from || d.to }) };
    }
    case 'condition_change': {
      const { condition, change, into, cause } = e.data as Record<string, string>;
      const text =
        change === 'transformed' ? `se convierte en ${into}` : change === 'added' ? `ahora está: ${condition}` : `ya no está: ${condition}`;
      next = { ...next, feed: pushFeed(next.feed, { ...feedItem(seq, e, text), reasoning: cause || undefined }) };
      if (change !== 'transformed') return next;
      return {
        ...next,
        banner: { id: seq, tick: e.tick, kind: 'transform', text: `${e.source} se ha convertido en ${into}`, location: String(e.data.location ?? '') },
      };
    }
    case 'trade_result': {
      if (e.data.accepted || e.data.reason === 'declined') return next;
      const text = `La oferta de ${e.data.from} a ${e.data.to} (${amount(e.data.amount)} ${e.data.item}) ${e.data.reason === 'expired' ? 'caduca sin respuesta' : `falla: ${e.data.reason}`}`;
      return { ...next, feed: pushFeed(next.feed, { ...feedItem(seq, e, text), source: '' }) };
    }
    case 'environment_change': {
      const changes = Object.entries((e.data.global_state ?? {}) as Record<string, unknown>)
        .map(([k, v]) => `${k} = ${JSON.stringify(v)}`)
        .join(', ');
      if (!changes) return next;
      const item = feedItem(seq, e, `El mundo cambia: ${changes}`);
      // A variable nudged every tick (oxygen, fuel…) updates its last line instead of flooding the feed.
      const last = next.feed[next.feed.length - 1];
      const keys = (d: Record<string, unknown> | undefined) => Object.keys(d ?? {}).sort().join(',');
      let prev: SimEvent | undefined;
      if (last?.type === 'environment_change')
        for (let i = next.recent.length - 1; i >= 0 && !prev; i--) if (next.recent[i].type === 'environment_change' && next.recent[i] !== e) prev = next.recent[i];
      if (last && prev && keys(prev.data.global_state as Record<string, unknown>) === keys(e.data.global_state as Record<string, unknown>))
        return { ...next, feed: [...next.feed.slice(0, -1), item] };
      return { ...next, feed: pushFeed(next.feed, item) };
    }
    case 'tick_start':
      return {
        ...next,
        status: 'running',
        llm: { ...s.llm, tickDecisions: 0, tickErrors: 0, tickParseErrors: 0 },
        lastTick: s.lastTick < 0 ? s.lastTick : Math.max(s.lastTick, e.tick),
        progress: { tick: e.tick, phase: 'deciding', decided: [] },
      };
    case 'tick_end':
      return {
        ...next,
        relFrames: [...next.relFrames.slice(-(FRAME_LIMIT - 1)), relFrame(e.tick, e.data as SimState)],
        sim: e.data as SimState,
        simFresh: true,
        status: s.status === 'idle' ? 'running' : s.status,
        llm: llmAfterTick(s.llm, (e.data as SimState).llm_stats),
        lastTick: Math.max(s.lastTick, e.tick),
        runAgents: s.runAgents ?? namesOf(e.data as SimState),
        runMaxTicks: (e.data as SimState).clock?.max_ticks ?? s.runMaxTicks,
        progress: { ...s.progress, tick: e.tick, phase: 'idle' },
      };
    case 'scheduled_event':
    case 'injected_event': {
      const text = String(e.data.description ?? '');
      const banner: Banner = {
        id: seq,
        tick: e.tick,
        kind: e.type === 'scheduled_event' ? 'scheduled' : 'injected',
        text,
        location: String(e.data.location ?? ''),
      };
      return { ...next, banner, feed: pushFeed(next.feed, feedItem(seq, e, text)) };
    }
    case 'reflection': {
      const text = String(e.data.summary ?? '');
      const list = [...(s.reflections[e.source] ?? []), { tick: e.tick, text }].slice(-20);
      return {
        ...next,
        reflections: { ...s.reflections, [e.source]: list },
        feed: pushFeed(next.feed, feedItem(seq, e, text)),
        progress: { ...s.progress, phase: 'reflecting' },
      };
    }
    case 'interaction': {
      const parsed = parseInteraction(String(e.data.result ?? ''));
      next = { ...next, feed: pushFeed(next.feed, feedItem(seq, e, String(e.data.result ?? ''))) };
      if (!parsed) return next;
      return addChat(next, e.tick, {
        tick: e.tick,
        speaker: parsed.initiator,
        target: parsed.target,
        kind: parsed.kind,
        text: parsed.content,
      });
    }
    case 'agent_speak':
    case 'agent_move':
    case 'agent_action':
    case 'agent_post': {
      const action = parseAction(e.data.action);
      const reasoning = String(e.data.reasoning ?? '');
      if (e.data.follow) {
        // Moved by following someone: not a decision of its own.
        return { ...next, feed: pushFeed(next.feed, { ...feedItem(seq, e, `${String(e.data.action ?? '')} (following ${String(e.data.follow)})`), action }) };
      }
      next = {
        ...next,
        llm: llmAfterDecision(s.llm, e),
        feed: pushFeed(next.feed, { ...feedItem(seq, e, e.data.action_type === 'attack' ? attackText(e.data) : String(e.data.action ?? '')), action, reasoning: reasoning || undefined }),
        reasoning: { ...s.reasoning, [e.source]: { tick: e.tick, action: String(e.data.action ?? ''), text: reasoning } },
        progress: s.progress.decided.includes(e.source)
          ? s.progress
          : { ...s.progress, tick: e.tick, decided: [...s.progress.decided, e.source] },
      };
      if (action.kind === 'speak' || action.kind === 'whisper') {
        for (const target of targetsOf(e.data, action.target)) {
          next = addChat(next, e.tick, { tick: e.tick, speaker: e.source, target, kind: action.kind, text: action.content });
        }
      } else if (action.kind === 'invite') {
        const text = `→ ${action.place}${action.content ? `: “${action.content}”` : ''}`;
        for (const target of targetsOf(e.data, action.target)) {
          next = addChat(next, e.tick, { tick: e.tick, speaker: e.source, target, kind: 'invite', text });
        }
      } else if (action.kind === 'post') {
        next = { ...next, posts: [...next.posts.slice(-100), { tick: e.tick, author: e.source, text: action.content }] };
      }
      return next;
    }
    default:
      return { ...next, feed: pushFeed(next.feed, feedItem(seq, e, JSON.stringify(e.data))) };
  }
}

/** «ataca a Marcos con la escopeta: acierta (−40 % de salud)», «… : falla», «… — Marcos muere». */
export function attackText(d: Record<string, unknown>): string {
  const target = String(d.target ?? '');
  const weapon = d.weapon ? ` con ${String(d.weapon)}` : '';
  const head = `ataca a ${target}${weapon}`;
  if (d.hit === undefined) return String(d.action ?? head);
  if (d.killed) return `${head} — ${target} muere`;
  if (!d.hit) return `${head}: falla`;
  return `${head}: acierta (−${Math.round(Number(d.damage ?? 0) * 100)} % de salud)`;
}

function llmAfterDecision(llm: LlmStatus, e: SimEvent): LlmStatus {
  const reasoning = String(e.data.reasoning ?? '');
  const failed = LLM_ERROR.test(reasoning);
  const unparsable = PARSE_ERROR.test(reasoning);
  return {
    ...llm,
    tickDecisions: llm.tickDecisions + 1,
    tickErrors: llm.tickErrors + (failed ? 1 : 0),
    tickParseErrors: llm.tickParseErrors + (unparsable ? 1 : 0),
    errors: llm.errors + (failed ? 1 : 0),
    parseErrors: llm.parseErrors + (unparsable ? 1 : 0),
    lastError: failed ? reasoning.replace(LLM_ERROR, '') : llm.lastError,
    lastParseError: unparsable ? reasoning.replace(PARSE_ERROR, '') : llm.lastParseError,
    lastErrorTick: failed || unparsable ? e.tick : llm.lastErrorTick,
  };
}

function llmAfterTick(llm: LlmStatus, stats: Record<string, unknown> | undefined): LlmStatus {
  const bad = llm.tickErrors + llm.tickParseErrors;
  const allFailed = llm.tickDecisions > 0 && bad === llm.tickDecisions;
  return {
    ...llm,
    mode: !stats ? llm.mode : stats.mode === 'demo' ? 'demo' : 'llm',
    calls: Number(stats?.total_calls ?? llm.calls),
    cacheHits: Number(stats?.cache_hits ?? llm.cacheHits),
    failingTicks: allFailed ? llm.failingTicks + 1 : bad === 0 ? 0 : llm.failingTicks,
    failKind: allFailed ? (llm.tickErrors > 0 ? 'llm' : 'parse') : llm.failKind,
    lastTickParseErrors: llm.tickParseErrors,
    lastTickDecisions: llm.tickDecisions,
    tickDecisions: 0,
    tickErrors: 0,
    tickParseErrors: 0,
  };
}

function amount(n: unknown): string {
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** Feed line for item movements that no agent action explains (production, event effects). */
export function transferText(d: Record<string, any>): string {
  const what = `${amount(d.amount)} ${d.item}`;
  const place = (s: string) => (s.startsWith('location:') ? s.slice('location:'.length) : s);
  if (d.kind === 'produce') return `${d.to} produce ${what} en ${d.location || place(String(d.from))}`;
  if (d.kind === 'dropped') return `${d.item} cae de las manos de ${d.from} en ${d.location}`;
  if (d.kind === 'holder') return d.to ? `👑 ${d.to} se hace con ${d.item}${d.from ? ` (se lo quita a ${d.from})` : ''}` : `👑 ${d.item} se queda sin dueño`;
  if (d.kind !== 'effect') return '';
  if (d.to) return `${place(String(d.to))} recibe ${what}`;
  return `${place(String(d.from))} pierde ${what}`;
}

function feedItem(id: number, e: SimEvent, text: string): FeedItem {
  return { id, tick: e.tick, type: e.type, source: e.source, text };
}

function pushFeed(feed: FeedItem[], item: FeedItem): FeedItem[] {
  return [...feed.slice(-(FEED_LIMIT - 1)), item];
}

export function pairKey(a: string, b: string): string {
  return [a, b].sort((x, y) => x.localeCompare(y)).join('↔');
}

function addChat(s: SimSnapshot, tick: number, line: ChatLine): SimSnapshot {
  const key = pairKey(line.speaker, line.target);
  const convs = s.conversations;
  let idx = -1;
  for (let i = convs.length - 1; i >= 0; i--) {
    if (pairKey(...convs[i].participants) === key) {
      idx = i;
      break;
    }
  }
  if (idx >= 0 && tick - convs[idx].lastTick <= CONVERSATION_GAP) {
    const conv = convs[idx];
    const updated: Conversation = { ...conv, lastTick: tick, lines: [...conv.lines, line] };
    // Most recently active conversation goes last.
    return { ...s, conversations: [...convs.slice(0, idx), ...convs.slice(idx + 1), updated] };
  }
  const speaker = agentByName(s.sim, line.speaker);
  const conv: Conversation = {
    id: `${key}@${tick}`,
    participants: [line.speaker, line.target],
    location: speaker?.location ?? '',
    startTick: tick,
    lastTick: tick,
    lines: [line],
  };
  return { ...s, conversations: [...convs.slice(-(CONVERSATION_LIMIT - 1)), conv] };
}

interface SearchData {
  target: string;
  step: 'started' | 'asked' | 'moved' | 'found' | 'gave_up' | 'lost';
  place?: string;
  clues?: Array<{ by: string; place: string; ago: number }>;
}

/** Feed line for a step of a search (null for the start: the action line already says it). */
export function searchText(d: SearchData): string | null {
  const clue = (c: { by: string; place: string; ago: number }) => `${c.by === 'you' ? 'lo vio' : c.by}: ${c.place}${c.ago > 0 ? ` (hace ${c.ago})` : ''}`;
  switch (d.step) {
    case 'asked': {
      const clues = (d.clues ?? []).filter((c) => c.by !== 'you');
      return `pregunta si alguien ha visto a ${d.target}${clues.length ? ' · ' + clues.map(clue).join(' · ') : ' · nadie lo ha visto'}`;
    }
    case 'moved':
      return `va a ${d.place} buscando a ${d.target}`;
    case 'found':
      return `encuentra a ${d.target}${d.place ? ` en ${d.place}` : ''}`;
    case 'gave_up':
      return `deja de buscar a ${d.target}`;
    case 'lost':
      return `ya no puede encontrar a ${d.target}`;
    default:
      return null;
  }
}

interface FactionData {
  faction: string;
  change: 'founded' | 'joined' | 'left' | 'expelled' | 'leader' | 'dissolved' | 'rival';
  agent: string;
  other?: string;
  goal?: string;
}

/** Feed line for a change in a group. */
export function factionText(d: FactionData): string {
  switch (d.change) {
    case 'founded':
      return `funda el grupo «${d.faction}»${d.goal ? ` (${d.goal})` : ''}${d.other ? ` e invita a ${d.other}` : ''}`;
    case 'joined':
      return `se une a «${d.faction}»`;
    case 'left':
      return `deja «${d.faction}»`;
    case 'expelled':
      return `es expulsado de «${d.faction}»`;
    case 'leader':
      return `pasa a liderar «${d.faction}»`;
    case 'dissolved':
      return `el grupo «${d.faction}» se disuelve`;
    case 'rival':
      return `«${d.faction}» y «${d.other}» pasan a ser rivales`;
    default:
      return `${d.faction}: ${d.change}`;
  }
}
