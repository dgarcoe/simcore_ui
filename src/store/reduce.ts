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

export interface SimSnapshot {
  sim: SimState | null;
  scenarioName: string;
  status: RunStatus;
  feed: FeedItem[];
  conversations: Conversation[];
  posts: Post[];
  reflections: Record<string, { tick: number; text: string }[]>;
  banner: Banner | null;
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

/** Returns null when the event is a duplicate and must be ignored. */
export function reduce(s: SimSnapshot, e: SimEvent): SimSnapshot | null {
  if (e.type !== 'tick_end' && isDuplicate(s.recent, e)) return null;
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
      return { ...next, status: 'running' };
    case 'tick_end':
      return { ...next, sim: e.data as SimState, status: s.status === 'idle' ? 'running' : s.status };
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
      next = { ...next, feed: pushFeed(next.feed, { ...feedItem(seq, e, String(e.data.action ?? '')), action }) };
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
