import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameLink, joinGame, myAgent, parsePlayHash, pointsSpent, saveMyAgent } from './games';

describe('games with players', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads game links, with or without a personal token', () => {
    expect(parsePlayHash('#/jugar/k7qf-2m4p')).toEqual({ code: 'K7QF-2M4P', token: null });
    expect(parsePlayHash('#/jugar/K7QF-2M4P?yo=abc%2Bd')).toEqual({ code: 'K7QF-2M4P', token: 'abc+d' });
    expect(parsePlayHash('#/')).toBeNull();
    expect(gameLink('https://sim.local', 'K7QF-2M4P', 'abc+d')).toBe('https://sim.local/#/jugar/K7QF-2M4P?yo=abc%2Bd');
  });

  it('counts attribute points above 10 (lowering one gives one back)', () => {
    expect(pointsSpent({ strength: 14, wisdom: 8 })).toBe(2);
    expect(pointsSpent(undefined)).toBe(0);
  });

  it('players only talk to /api/play, with their token in a header', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const body = url.endsWith('/join') ? { player_id: 'p', token: 't0k' } : { agent: { name: 'Ana' }, submitted: true, display_name: 'Ana', status: 'open' };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    expect((await joinGame('k7qf-2m4p', 'Ana')).token).toBe('t0k');
    await myAgent('K7QF-2M4P', 't0k');
    await saveMyAgent('K7QF-2M4P', 't0k', { name: 'Ana' }, true);
    expect(calls.map((c) => c.url)).toEqual(['/api/play/K7QF-2M4P/join', '/api/play/K7QF-2M4P/me', '/api/play/K7QF-2M4P/me']);
    expect(calls.every((c) => c.url.startsWith('/api/play/'))).toBe(true);
    expect((calls[1].init.headers as Record<string, string>)['X-Player-Token']).toBe('t0k');
    expect(JSON.parse(String(calls[2].init.body))).toEqual({ agent: { name: 'Ana' }, submitted: true });
  });

  it('shows the server message when something is refused', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ detail: 'La partida está completa.' }), { status: 422 }));
    await expect(joinGame('X', 'Ana')).rejects.toThrow('La partida está completa.');
  });
});
