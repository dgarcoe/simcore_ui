import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../api/types';
import { addDecision, classifyDecision, closeTick, decisions, healthAdvice, initialHealth, topReasons, usefulPct } from './llmHealth';
import { initialSnapshot, reduce } from './reduce';

describe('classifying decisions', () => {
  it.each([
    ['I want to see what is going on', 'ok', undefined],
    ['muerto_errante: goes for Lola', 'rules', undefined],
    ["Couldn't morder: Nico is not here. muerto_errante: goes for Nico", 'rules', undefined],
    ['LLM error: Connection refused (ollama:11434)', 'failed', undefined],
    ['Parse error: Expecting value: line 1 column 1', 'invalid', undefined],
    ["Parse error: 'saltar' is not a valid action", 'refused', 'invented'],
    ["Couldn't golpear: Marcos is not here. He is a zombie", 'refused', 'absent'],
    ['Target not present at this location', 'refused', 'absent'],
    ["Couldn't takes 2 : say which item in \"item\"; here you can take: tablones x6", 'refused', 'item'],
    ["Couldn't gives Ana 1 comida: I don't have 1 comida. She is hungry", 'refused', 'item'],
    ['Could not move to Cuartel de la Guardia: only for guardia. I want weapons', 'refused', 'place'],
    ["Couldn't reparar_radio: it has to be done at Torre de radio. Let's fix it", 'refused', 'place'],
    ["Couldn't disparar: I'm not able to. Shoot!", 'refused', 'not_allowed'],
  ])('%s → %s', (reasoning, kind, reason) => {
    const c = classifyDecision(reasoning);
    expect(c.kind).toBe(kind);
    expect(c.reason).toBe(reason);
  });

  it('counts by tick, by reason and by agent', () => {
    let h = initialHealth();
    h = addDecision(h, 'fine', 'Ana', 1);
    h = addDecision(h, "Couldn't golpear: Marcos is not here. x", 'Ana', 1);
    h = addDecision(h, 'muerto_errante: roams', 'Zombi', 1);
    h = addDecision(h, 'Parse error: bad json', 'Bob', 2);
    h = closeTick(h);
    expect(decisions(h)).toBe(3);
    expect(usefulPct(h)).toBe(33);
    expect(h.recent).toEqual([{ tick: 1, ok: 1, bad: 1 }, { tick: 2, ok: 0, bad: 1 }]);
    expect(h.reasons.absent).toMatchObject({ count: 1, example: "Couldn't golpear: Marcos is not here", agent: 'Ana', tick: 1 });
    expect(h.badBy).toEqual({ Ana: 1, Bob: 1 });
  });

  it('advises from what dominates', () => {
    let h = initialHealth();
    for (let i = 0; i < 6; i++) h = addDecision(h, 'ok', 'Ana', 1);
    for (let i = 0; i < 4; i++) h = addDecision(h, "Couldn't golpear: Marcos is not here. x", 'Ana', 1);
    const advice = healthAdvice(h, 'ollama/llama3.2:3b', 'ERR', 'PARSE');
    expect(advice[0]).toMatch(/quién está en cada sitio/);
    expect(advice.at(-1)).toMatch(/modelo pequeño/);
    let good = initialHealth();
    for (let i = 0; i < 9; i++) good = addDecision(good, 'ok', 'Ana', 1);
    expect(healthAdvice(good, 'ollama/qwen2.5:7b', 'ERR', 'PARSE')).toEqual(['El modelo va bien: la mayoría de sus decisiones se pueden llevar a cabo.']);
  });
});

describe('health of a whole run', () => {
  it('leaves rule-driven hordes out and explains the refusals of San Lorenzo', () => {
    const replay = JSON.parse(readFileSync(new URL('../../public/fixtures/zombie-siege.json', import.meta.url), 'utf8')) as { events: SimEvent[] };
    let s = initialSnapshot();
    for (const e of replay.events) s = reduce(s, e) ?? s;
    const h = s.llm.health;
    const decided = replay.events.filter((e) => ['agent_action', 'agent_speak', 'agent_move', 'agent_post', 'agent_search'].includes(e.type) && !e.data.follow);
    const rules = decided.filter((e) => classifyDecision(String(e.data.reasoning ?? '')).kind === 'rules').length;
    expect(rules).toBeGreaterThan(50);
    expect(decisions(h)).toBe(decided.length - rules);
    expect(h.refused).toBeGreaterThan(0);
    expect(topReasons(h)[0][1].example).toBeTruthy();
    expect(h.recent.length).toBe(10);
  });
});
