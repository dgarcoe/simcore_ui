// Pure reducer that turns the raw Simcore event stream into UI-friendly
// state: current snapshot, activity feed, conversations, posts, banners.

import { parseAction, parseInteraction, type ParsedAction } from '../api/parse';
import type { Agent, EventType, SimEvent, SimState } from '../api/types';

export interface FeedItem {
  id: number;
  tick: number;
  type: EventType;
  source: string;
  text: string;
  action?: ParsedAction;
}

export type ChatKind = 'speak' | 'trade' | 'interact';

export interface ChatLine {
  tick: number;
  speaker: string;
  target: string;
  kind: ChatKind;
  text: string;
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
  kind: 'scheduled' | 'injected' | 'end';
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
  tickDecisions: number;
  tickErrors: number;
}

export function initialLlm(): LlmStatus {
  return { mode: 'unknown', calls: 0, cacheHits: 0, errors: 0, lastError: '', lastErrorTick: -1, failingTicks: 0, tickDecisions: 0, tickErrors: 0 };
}

const LLM_ERROR = /^LLM error:\s*/;

export interface SimSnapshot {
  sim: SimState | null;
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
  seq: number;
  recent: SimEvent[];
}

export const FEED_LIMIT = 400;
export const CONVERSATION_LIMIT = 150;
/** A new conversation starts when a pair has been silent for this many ticks. */
export const CONVERSATION_GAP = 3;

export function initialSnapshot(): SimSnapshot {
  return {
    sim: null,
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
    seq: 0,
    recent: [],
  };
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
  if (e.type === 'simulation_end' && !s.stopRequested && (s.runMaxTicks === null || e.tick < s.runMaxTicks)) return true;
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
  if (e.type !== 'tick_end' && isDuplicate(s.recent, e)) return null;
  if (isStale(s, e)) return null;
  const recent = e.type === 'tick_end' ? s.recent : [...s.recent.slice(-30), e];
  const seq = s.seq + 1;
  let next: SimSnapshot = { ...s, recent, seq };

  switch (e.type) {
    case 'simulation_start':
      return {
        ...initialSnapshot(),
        sim: s.sim,
        scenarioName: String(e.data.config ?? ''),
        status: 'running',
        lastTick: 0,
        seq,
        recent: [e],
        feed: [feedItem(seq, e, `▶ ${e.data.config ?? 'Simulation'} started`)],
      };
    case 'simulation_end':
      return {
        ...next,
        status: 'ended',
        banner: { id: seq, tick: e.tick, kind: 'end', text: 'Simulation finished', location: '' },
        feed: pushFeed(next.feed, feedItem(seq, e, '■ Simulation finished')),
      };
    case 'tick_start':
      return {
        ...next,
        status: 'running',
        llm: { ...s.llm, tickDecisions: 0, tickErrors: 0 },
        lastTick: s.lastTick < 0 ? s.lastTick : Math.max(s.lastTick, e.tick),
      };
    case 'tick_end':
      return {
        ...next,
        sim: e.data as SimState,
        status: s.status === 'idle' ? 'running' : s.status,
        llm: llmAfterTick(s.llm, (e.data as SimState).llm_stats),
        lastTick: Math.max(s.lastTick, e.tick),
        runAgents: s.runAgents ?? namesOf(e.data as SimState),
        runMaxTicks: (e.data as SimState).clock?.max_ticks ?? s.runMaxTicks,
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
      next = {
        ...next,
        llm: llmAfterDecision(s.llm, e),
        feed: pushFeed(next.feed, { ...feedItem(seq, e, String(e.data.action ?? '')), action }),
      };
      if (action.kind === 'speak') {
        next = addChat(next, e.tick, { tick: e.tick, speaker: e.source, target: action.target, kind: 'speak', text: action.content });
      } else if (action.kind === 'post') {
        next = { ...next, posts: [...next.posts.slice(-100), { tick: e.tick, author: e.source, text: action.content }] };
      }
      return next;
    }
    default:
      return { ...next, feed: pushFeed(next.feed, feedItem(seq, e, JSON.stringify(e.data))) };
  }
}

function llmAfterDecision(llm: LlmStatus, e: SimEvent): LlmStatus {
  const reasoning = String(e.data.reasoning ?? '');
  const failed = LLM_ERROR.test(reasoning);
  return {
    ...llm,
    tickDecisions: llm.tickDecisions + 1,
    tickErrors: llm.tickErrors + (failed ? 1 : 0),
    errors: llm.errors + (failed ? 1 : 0),
    lastError: failed ? reasoning.replace(LLM_ERROR, '') : llm.lastError,
    lastErrorTick: failed ? e.tick : llm.lastErrorTick,
  };
}

function llmAfterTick(llm: LlmStatus, stats: Record<string, unknown> | undefined): LlmStatus {
  const allFailed = llm.tickDecisions > 0 && llm.tickErrors === llm.tickDecisions;
  return {
    ...llm,
    mode: !stats ? llm.mode : stats.mode === 'demo' ? 'demo' : 'llm',
    calls: Number(stats?.total_calls ?? llm.calls),
    cacheHits: Number(stats?.cache_hits ?? llm.cacheHits),
    failingTicks: allFailed ? llm.failingTicks + 1 : llm.tickErrors === 0 ? 0 : llm.failingTicks,
    tickDecisions: 0,
    tickErrors: 0,
  };
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
