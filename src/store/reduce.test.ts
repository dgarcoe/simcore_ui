import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../api/types';
import { initialSnapshot, reduce, type SimSnapshot } from './reduce';

const fixture: SimEvent[] = JSON.parse(
  readFileSync(new URL('../../public/fixtures/epidemic.json', import.meta.url), 'utf8'),
).events;

function run(events: SimEvent[], start = initialSnapshot()): SimSnapshot {
  return events.reduce((s, e) => reduce(s, e) ?? s, start);
}

const ev = (type: SimEvent['type'], tick: number, data: Record<string, unknown>, source = ''): SimEvent => ({
  type,
  tick,
  data,
  source,
});

describe('reduce', () => {
  it('replays a recorded run end to end', () => {
    const s = run(fixture);
    expect(s.scenarioName).toBe('Outbreak');
    expect(s.sim?.clock.tick).toBeGreaterThan(0);
    expect(Object.keys(s.sim!.agents)).toHaveLength(6);
    expect(s.conversations.length).toBeGreaterThan(0);
    expect(s.feed.length).toBeGreaterThan(0);
  });

  it('ignores duplicated events', () => {
    const e = ev('agent_move', 3, { action: 'moves to School' }, 'Rosa');
    const s1 = reduce(initialSnapshot(), e)!;
    expect(reduce(s1, e)).toBeNull();
  });

  it('groups speech between the same pair into one conversation', () => {
    const s = run([
      ev('agent_speak', 1, { action: 'says to Bob: "hi"' }, 'Ann'),
      ev('agent_speak', 2, { action: 'says to Ann: "hello"' }, 'Bob'),
      ev('interaction', 3, { result: 'Ann trades with Bob: two apples' }, 'Ann'),
      ev('agent_speak', 3, { action: 'says to Cid: "yo"' }, 'Ann'),
    ]);
    expect(s.conversations).toHaveLength(2);
    const annBob = s.conversations.find((c) => c.participants.includes('Bob'))!;
    expect(annBob.lines.map((l) => l.kind)).toEqual(['speak', 'speak', 'trade']);
    expect(annBob.lines[1]).toMatchObject({ speaker: 'Bob', target: 'Ann', text: 'hello' });
  });

  it('adds a line spoken to several people to each pair conversation', () => {
    const s = run([
      ev('agent_speak', 1, { action: 'says to Bob, Cid: "the bridge is down"', targets: ['Bob', 'Cid'] }, 'Ann'),
      ev('agent_speak', 2, { action: 'says to Dee, Eve: "run"' }, 'Ann'),
    ]);
    expect(s.conversations.map((c) => [...c.participants].sort().join('+')).sort()).toEqual(['Ann+Bob', 'Ann+Cid', 'Ann+Dee', 'Ann+Eve']);
    expect(s.conversations.every((c) => c.lines[0].kind === 'speak')).toBe(true);
  });

  it('keeps whispers and invitations in the pair conversation; following is not a decision', () => {
    const s = run([
      ev('agent_action', 1, { action: 'whispers to Bob: "the key"', action_type: 'whisper', targets: ['Bob'] }, 'Ann'),
      ev('agent_action', 2, { action: 'invites Bob to Barn: "come"', action_type: 'invite', targets: ['Bob'], place: 'Barn' }, 'Ann'),
      ev('agent_move', 2, { action: 'moves to Barn', action_type: 'move', follow: 'Ann', reasoning: 'following Ann' }, 'Cid'),
    ]);
    const conv = s.conversations.find((c) => c.participants.includes('Bob'))!;
    expect(conv.lines.map((l) => [l.kind, l.text])).toEqual([['whisper', 'the key'], ['invite', '→ Barn: “come”']]);
    expect(s.progress.decided).not.toContain('Cid');
    expect(s.feed.at(-1)?.text).toContain('following Ann');
  });

  it('narrates a search step by step', () => {
    const s = run([
      ev('agent_search', 1, { agent: 'Ann', target: 'Tom', step: 'started', place: 'Plaza', clues: [] }, 'Ann'),
      ev('agent_search', 1, { agent: 'Ann', target: 'Tom', step: 'asked', place: 'Plaza', clues: [{ by: 'Bob', place: 'Iglesia', ago: 2 }] }, 'Ann'),
      ev('agent_search', 2, { agent: 'Ann', target: 'Tom', step: 'moved', place: 'Iglesia', clues: [] }, 'Ann'),
      ev('agent_search', 2, { agent: 'Ann', target: 'Tom', step: 'found', place: 'Iglesia', clues: [] }, 'Ann'),
    ]);
    expect(s.feed.map((f) => f.text)).toEqual([
      'pregunta si alguien ha visto a Tom · Bob: Iglesia (hace 2)',
      'va a Iglesia buscando a Tom',
      'encuentra a Tom en Iglesia',
    ]);
  });

  it('tells group changes and vote results', () => {
    const s = run([
      ev('faction_change', 1, { faction: 'Molino', change: 'founded', agent: 'Ann', other: 'Bob', goal: 'salir' }, 'Ann'),
      ev('vote_result', 1, { question: '¿Cerramos?', winner: 'sí', counts: { sí: 2, no: 1 }, place: 'Plaza' }),
    ]);
    expect(s.feed.map((f) => f.text)).toEqual(['funda el grupo «Molino» (salir) e invita a Bob', '🗳 Votación «¿Cerramos?»: gana «sí» (sí 2 · no 1)']);
    expect(s.banner).toMatchObject({ kind: 'vote', location: 'Plaza' });
    expect(s.moments.map((m) => m.text)).toEqual(['Ann funda el grupo «Molino»', 'Votación «¿Cerramos?»: gana sí']);
  });

  it('logs dice rolls and level ups, keeps the latest rolls per agent and banners the level', () => {
    const s = run([
      ev('dice_roll', 1, { agent: 'Ortega', check: 'attack', attribute: 'strength', roll: 14, modifier: 4, total: 18, dc: 13, success: true, critical: false, fumble: false, target: 'Bob' }, 'Ortega'),
      ev('dice_roll', 1, { agent: 'Ana', check: 'deceive', attribute: 'charisma', roll: 1, modifier: 2, total: 3, against: { agent: 'Tom', attribute: 'wisdom', roll: 9, total: 10 }, success: false, critical: false, fumble: true, target: 'Tom' }, 'Ana'),
      ev('dice_roll', 1, { agent: 'Ortega', check: 'golpear', attribute: 'strength', roll: 20, modifier: 0, total: 20, dc: 11, success: true, critical: true, fumble: false, target: 'Muerto' }, 'Ortega'),
      ev('level_up', 1, { agent: 'Ortega', level: 3, improved: { attribute: 'strength', skill: 'perception' } }, 'Ortega'),
    ]);
    expect(s.feed.map((f) => f.text)).toEqual([
      'ataca a Bob: 14 + 4 = 18 contra 13 — ¡acierta!',
      'engaña a Tom: 1 + 2 = 3 contra 10 (Tom) — 💀 ¡pifia! lo pilla mintiendo',
      'golpear a Muerto: 20 contra 11 — 💥 ¡crítico! lo consigue',
      'sube a nivel 3 (FUE +1, aprende Percepción)',
    ]);
    expect(s.rolls.Ortega.map((r) => r.total)).toEqual([18, 20]);
    expect(s.banner).toMatchObject({ kind: 'level', text: 'Ortega: ¡NIVEL 3!' });
    expect(s.moments.map((m) => m.text)).toEqual(['¡Pifia! Ana: deceive contra Tom', '¡Crítico! Ortega: golpear contra Muerto', 'Ortega sube a nivel 3']);
  });

  it('notes in the feed when someone ignores a speaker', () => {
    const s = run([ev('speech_ignored', 3, { agent: 'Ann', by: 'Bob', text: 'help?', turns: 2 }, 'Bob')]);
    expect(s.feed.at(-1)?.text).toBe('no le contesta a Ann (2 turnos): «help?»');
  });

  it('starts a new conversation after a long silence', () => {
    const s = run([
      ev('agent_speak', 1, { action: 'says to Bob: "hi"' }, 'Ann'),
      ev('agent_speak', 10, { action: 'says to Bob: "again"' }, 'Ann'),
    ]);
    expect(s.conversations).toHaveLength(2);
  });

  it('shows a banner for scheduled and injected events', () => {
    const s = run([ev('injected_event', 4, { description: 'Fire!', location: 'Market' })]);
    expect(s.banner).toMatchObject({ kind: 'injected', text: 'Fire!', location: 'Market' });
  });

  it('records posts and reflections', () => {
    const s = run([
      ev('agent_post', 1, { action: 'posts online: big news' }, 'Ann'),
      ev('reflection', 12, { summary: 'I learned things' }, 'Ann'),
    ]);
    expect(s.posts).toEqual([{ tick: 1, author: 'Ann', text: 'big news' }]);
    expect(s.reflections.Ann).toEqual([{ tick: 12, text: 'I learned things' }]);
  });

  it('resets on simulation_start', () => {
    const s = run([
      ev('agent_speak', 1, { action: 'says to Bob: "hi"' }, 'Ann'),
      ev('simulation_start', 0, { config: 'Again', agents: 2 }),
    ]);
    expect(s.conversations).toHaveLength(0);
    expect(s.scenarioName).toBe('Again');
    expect(s.status).toBe('running');
  });

  it('reports demo mode from llm_stats', () => {
    expect(run(fixture).llm.mode).toBe('demo');
  });

  it('tracks a real LLM and its failures', () => {
    const stats = (calls: number) => ({ llm_stats: { total_calls: calls, cache_hits: 1, cache_hit_rate: 0.1 } });
    const fail = (src: string, tick: number) =>
      ev('agent_action', tick, { action: 'waits', reasoning: 'LLM error: Connection refused (ollama:11434)' }, src);
    let s = run([
      ev('tick_start', 1, {}),
      ev('agent_action', 1, { action: 'rests', reasoning: 'tired' }, 'Ann'),
      ev('tick_end', 1, stats(2)),
    ]);
    expect(s.llm).toMatchObject({ mode: 'llm', calls: 2, cacheHits: 1, errors: 0, failingTicks: 0 });

    s = run([ev('tick_start', 2, {}), fail('Ann', 2), fail('Bob', 2), ev('tick_end', 2, stats(4))], s);
    expect(s.llm).toMatchObject({ errors: 2, failingTicks: 1, lastError: 'Connection refused (ollama:11434)', lastErrorTick: 2 });

    s = run([ev('tick_start', 3, {}), fail('Ann', 3), ev('agent_action', 3, { action: 'rests', reasoning: 'ok' }, 'Bob'), ev('tick_end', 3, stats(6))], s);
    expect(s.llm.failingTicks).toBe(1);

    s = run([ev('tick_start', 4, {}), ev('agent_action', 4, { action: 'rests', reasoning: 'ok' }, 'Bob'), ev('tick_end', 4, stats(7))], s);
    expect(s.llm).toMatchObject({ failingTicks: 0, errors: 3 });
  });

  it('drops leftovers of the previous run that arrive after a new start', () => {
    const agents = (names: string[]) => Object.fromEntries(names.map((n) => [n.toLowerCase(), { name: n }]));
    let s = run([
      ev('simulation_start', 0, { config: 'Outbreak' }),
      ev('tick_start', 1, {}),
      ev('tick_end', 1, { clock: { tick: 1 }, agents: agents(['Rosa', 'Frank']) }),
    ]);
    // A new scenario starts while Outbreak's tick 32 is still waiting on the LLM.
    s = run(
      [
        ev('simulation_start', 0, { config: 'Zombies' }),
        ev('agent_action', 32, { action: 'observes surroundings' }, 'Rosa'),
        ev('tick_end', 32, { clock: { tick: 32 }, agents: agents(['Rosa', 'Frank']) }),
        ev('simulation_end', 32, {}),
        ev('tick_start', 1, {}),
        ev('agent_action', 1, { action: 'observes surroundings' }, 'Zombie'),
        ev('tick_end', 1, { clock: { tick: 1, max_ticks: 24 }, agents: agents(['Zombie', 'Ana']) }),
      ],
      s,
    );
    expect(s.scenarioName).toBe('Zombies');
    expect(s.status).toBe('running');
    expect(s.sim?.clock.tick).toBe(1);
    expect(s.feed.map((f) => f.source || f.text)).toEqual(['▶ Zombies started', 'Zombie']);
    expect(s.runAgents).toEqual(['Zombie', 'Ana']);
    // a late Outbreak action with a plausible tick is still caught by its agent
    expect(reduce(s, ev('agent_action', 2, { action: 'rests' }, 'Frank'))).toBeNull();
    // and its simulation_end, even with a tick that fits the new run
    expect(reduce(s, ev('simulation_end', 1, {}))).toBeNull();
    // the new run ends normally at its last tick, or early if this UI stopped it
    expect(reduce({ ...s, lastTick: 23 }, ev('simulation_end', 24, {}))?.status).toBe('ended');
    expect(reduce({ ...s, stopRequested: true }, ev('simulation_end', 1, {}))?.status).toBe('ended');
  });

  it('follows deaths, arrivals and departures, and an early end when nobody is left', () => {
    const agents = (names: string[]) => Object.fromEntries(names.map((n) => [n.toLowerCase(), { name: n }]));
    let s = run([
      ev('simulation_start', 0, { config: 'Colony' }),
      ev('tick_start', 1, {}),
      ev('tick_end', 1, { clock: { tick: 1, max_ticks: 24 }, agents: agents(['Ana', 'Bea']) }),
      ev('tick_start', 2, {}),
      ev('agent_death', 2, { agent: 'Ana', location: 'Mine', cause: 'Cave-in' }, 'Ana'),
      ev('agent_spawn', 2, { agent: 'Medic 1', location: 'Camp', profession: 'paramedic' }, 'Medic 1'),
      ev('agent_action', 2, { action: 'works: triage' }, 'Medic 1'),
      ev('agent_depart', 2, { agent: 'Bea', location: 'Camp', cause: '' }, 'Bea'),
      ev('environment_change', 2, { global_state: { mine_closed: true } }),
      ev('tick_end', 2, { clock: { tick: 2, max_ticks: 24 }, agents: agents(['Ana', 'Bea', 'Medic 1']) }),
    ]);
    expect(s.runAgents).toEqual(['Ana', 'Bea', 'Medic 1']);
    expect(s.sim?.clock.tick).toBe(2);
    expect(s.feed.map((f) => `${f.source} ${f.text}`.trim())).toEqual([
      '▶ Colony started',
      'Ana ha muerto en Mine',
      'Medic 1 llega (paramedic) a Camp',
      'Medic 1 works: triage',
      'Bea se marcha de Camp',
      'El mundo cambia: mine_closed = true',
    ]);
    expect(s.feed[1].reasoning).toBe('Cave-in');
    expect(s.banner).toMatchObject({ kind: 'arrival', text: 'Medic 1 ha llegado' });
    s = run([ev('simulation_end', 3, { reason: 'no_agents_left' })], s);
    expect(s.status).toBe('ended');
    expect(s.endReason).toBe('no_agents_left');
  });

  it('ignores an end that arrives before the new run has a tick', () => {
    const s = run([ev('simulation_start', 0, { config: 'B' }), ev('simulation_end', 1, {})]);
    expect(s.status).toBe('running');
  });

  it('keeps everything when joining a run mid-way', () => {
    const s = run([ev('agent_action', 40, { action: 'rests' }, 'Ann'), ev('tick_start', 41, {})]);
    expect(s.feed).toHaveLength(1);
  });

  it('tracks tick progress and each agent reasoning', () => {
    let s = run([ev('tick_start', 3, {}), ev('agent_action', 3, { action: 'rests', reasoning: 'I am tired' }, 'Ann')]);
    expect(s.progress).toEqual({ tick: 3, phase: 'deciding', decided: ['Ann'] });
    expect(s.reasoning.Ann).toEqual({ tick: 3, action: 'rests', text: 'I am tired' });
    expect(s.feed.at(-1)?.reasoning).toBe('I am tired');
    s = run([ev('agent_move', 3, { action: 'moves to Park', reasoning: 'fresh air' }, 'Bob'), ev('reflection', 3, { summary: 'hm' }, 'Ann')], s);
    expect(s.progress).toMatchObject({ phase: 'reflecting', decided: ['Ann', 'Bob'] });
    s = run([ev('tick_end', 3, { clock: { tick: 3 } })], s);
    expect(s.progress.phase).toBe('idle');
  });

  it('counts unparsable answers separately from failing calls', () => {
    const parse = (src: string, tick = 5) => ev('agent_action', tick, { action: 'waits', reasoning: "Parse error: 'talk' is not a valid ActionType" }, src);
    let s = run([
      ev('tick_start', 5, {}),
      parse('Ann'),
      ev('agent_action', 5, { action: 'rests', reasoning: 'ok' }, 'Bob'),
      ev('tick_end', 5, { llm_stats: { total_calls: 2 } }),
    ]);
    expect(s.llm).toMatchObject({ parseErrors: 1, lastTickParseErrors: 1, lastTickDecisions: 2, failingTicks: 0, errors: 0 });
    expect(s.llm.lastParseError).toContain('not a valid ActionType');
    s = run([ev('tick_start', 6, {}), parse('Ann', 6), parse('Bob', 6), ev('tick_end', 6, { llm_stats: { total_calls: 4 } })], s);
    expect(s.llm).toMatchObject({ failingTicks: 1, failKind: 'parse', lastTickParseErrors: 2 });
  });

  it('starts over when the same scenario is launched again', () => {
    const start = ev('simulation_start', 0, { config: 'Outbreak', agents: 6 });
    let s = run([start, ev('tick_start', 1, { time: 'Day 1, 01:00' }), ev('agent_action', 1, { action: 'rests', reasoning: 'tired' }, 'Ann')]);
    s = run([ev('tick_start', 5, { time: 'Day 1, 05:00' })], { ...s, lastTick: 4 });
    // relaunch: identical start, then the same first events as the previous run
    s = run([start, ev('tick_start', 6, {}), ev('tick_start', 1, { time: 'Day 1, 01:00' }), ev('agent_action', 1, { action: 'rests', reasoning: 'tired' }, 'Ann')], s);
    expect(s.progress).toMatchObject({ tick: 1, decided: ['Ann'] });
    expect(s.feed.map((f) => f.source || f.text)).toEqual(['▶ Outbreak started', 'Ann']);
  });
});

describe('items', () => {
  it('reports production, event supplies and expired offers, not the actions twice', () => {
    const s = run([
      ev('agent_action', 1, { action: 'gives Bruno 1 food', action_type: 'give' }, 'Ana'),
      ev('item_transfer', 1, { kind: 'give', item: 'food', amount: 1, from: 'Ana', to: 'Bruno', location: 'Plaza' }, 'Ana'),
      ev('item_transfer', 1, { kind: 'produce', item: 'food', amount: 2, from: 'location:Farm', to: 'Ana', location: 'Farm' }, 'location:Farm'),
      ev('item_transfer', 2, { kind: 'effect', item: 'medicine', amount: 5, from: '', to: 'location:Clinic', location: 'Clinic' }, 'location:Clinic'),
      ev('item_transfer', 2, { kind: 'effect', item: 'food', amount: 1, from: 'Bruno', to: '', location: 'Plaza' }, 'Bruno'),
      ev('trade_result', 3, { from: 'Ana', to: 'Bruno', item: 'money', amount: 2, accepted: false, reason: 'expired' }, 'Bruno'),
      ev('trade_result', 3, { from: 'Ana', to: 'Bruno', item: 'money', amount: 1, accepted: true, reason: '' }, 'Bruno'),
    ]);
    expect(s.feed.map((f) => `${f.source} ${f.text}`.trim())).toEqual([
      'Ana gives Bruno 1 food',
      'Ana produce 2 food en Farm',
      'Clinic recibe 5 medicine',
      'Bruno pierde 1 food',
      'La oferta de Ana a Bruno (2 money) caduca sin respuesta',
    ]);
    expect(s.feed[0].action).toMatchObject({ kind: 'give', item: 'food' });
  });
});

describe('conditions', () => {
  it('reports condition changes and announces transformations', () => {
    const s = run([
      ev('condition_change', 2, { agent: 'Ana', condition: 'infected', change: 'added', into: '', cause: 'bite by Zed', location: 'Plaza' }, 'Ana'),
      ev('agent_action', 2, { action: 'muerde a Ana', action_type: 'custom', name: 'bite', success: true, target: 'Ana' }, 'Zed'),
      ev('condition_change', 7, { agent: 'Ana', condition: 'infected', change: 'transformed', into: 'zombie', cause: '', location: 'Plaza' }, 'Ana'),
      ev('condition_change', 8, { agent: 'Bob', condition: 'panicked', change: 'removed', into: '', cause: 'it wore off', location: 'Plaza' }, 'Bob'),
    ]);
    expect(s.feed.map((f) => `${f.source} ${f.text}`)).toEqual([
      'Ana ahora está: infected',
      'Zed muerde a Ana',
      'Ana se convierte en zombie',
      'Bob ya no está: panicked',
    ]);
    expect(s.feed[0].reasoning).toBe('bite by Zed');
    expect(s.banner).toMatchObject({ kind: 'transform', text: 'Ana se ha convertido en zombie' });
  });
});

describe('world', () => {
  it('reports needs, place changes, rules and an end by rule', () => {
    let s = run([
      ev('simulation_start', 0, { config: 'W' }),
      ev('tick_start', 1, {}),
      ev('tick_end', 1, { clock: { tick: 1, max_ticks: 24 }, agents: {} }),
      ev('tick_start', 2, {}),
      ev('need_change', 2, { agent: 'Ana', need: 'hunger', label: 'hambre', level: 'high', cause: '' }, 'Ana'),
      ev('need_change', 2, { agent: 'Ana', need: 'hunger', label: 'hambre', level: 'ok', cause: 'food' }, 'Ana'),
      ev('place_change', 2, { location: 'Monte', closed: false, hazard: { label: 'en llamas' } }),
      ev('rule_fired', 2, { rule: 0, description: 'El monte arde', effects: {} }),
    ]);
    expect(s.feed.slice(1).map((f) => `${f.source} ${f.text}`.trim())).toEqual([
      'Ana hambre: alto',
      'Ana hambre: satisfecho',
      'Monte: abierto · en llamas',
      'El monte arde',
    ]);
    expect(s.banner).toMatchObject({ kind: 'scheduled', text: 'El monte arde' });
    s = run([ev('tick_start', 3, {}), ev('simulation_end', 3, { reason: 'rule', message: 'Valdeoscuro ha caído' })], s);
    expect(s.status).toBe('ended');
    expect(s.endMessage).toBe('Valdeoscuro ha caído');
  });
});

describe('minds', () => {
  it('reports plans, things told, secrets and rumors', () => {
    const s = run([
      ev('agent_plan', 1, { agent: 'Ana', steps: ['Ir a la taberna', 'Hablar con Tomás'], reason: 'first plan' }, 'Ana'),
      ev('belief_shared', 2, { from: 'Ana', to: 'Tomás', text: 'El pozo está envenenado', truth: false, secret: false }, 'Ana'),
      ev('belief_shared', 3, { from: 'Mateo', to: 'Ana', text: 'Vi algo en el monte', truth: true, secret: true }, 'Mateo'),
      ev('belief_shared', 4, { from: '', to: 'Lucía', text: 'El forastero trajo la criatura', truth: null, secret: false }, 'Lucía'),
    ]);
    expect(s.feed.map((f) => `${f.source} ${f.text}`)).toEqual([
      'Ana planea: 1) Ir a la taberna 2) Hablar con Tomás',
      'Ana le cuenta a Tomás: «El pozo está envenenado» (falso)',
      'Mateo le cuenta a Ana: «Vi algo en el monte» (secreto revelado)',
      'Lucía oye un rumor: «El forastero trajo la criatura»',
    ]);
  });
});

describe('world variables', () => {
  it('collapses repeated changes of the same variables into one line', () => {
    const s = run([
      ev('environment_change', 1, { global_state: { oxigeno: 0.97 } }),
      ev('environment_change', 2, { global_state: { oxigeno: 0.94 } }),
      ev('environment_change', 2, { global_state: { luz: false } }),
      ev('environment_change', 3, { global_state: { oxigeno: 0.91 } }),
    ]);
    expect(s.feed.map((f) => f.text)).toEqual(['El mundo cambia: oxigeno = 0.94', 'El mundo cambia: luz = false', 'El mundo cambia: oxigeno = 0.91']);
  });
});

describe('relaunch', () => {
  it("marks the previous run's state as stale until the new one arrives", () => {
    let s = run([
      ev('simulation_start', 0, { config: 'A' }),
      ev('tick_start', 1, {}),
      ev('tick_end', 1, { clock: { tick: 24, time: 'Day 2, 00:00', max_ticks: 48 }, agents: {} }),
    ]);
    expect(s.simFresh).toBe(true);
    s = run([ev('simulation_start', 0, { config: 'A' })], s);
    expect(s.sim?.clock.time).toBe('Day 2, 00:00'); // kept for the map…
    expect(s.simFresh).toBe(false); // …but not shown as the new run's clock
    s = run([ev('tick_end', 0, { clock: { tick: 0, time: 'Day 1, 00:00', max_ticks: 48 }, agents: {} })], s);
    expect(s.simFresh).toBe(true);
    expect(s.sim?.clock.time).toBe('Day 1, 00:00');
  });
});
