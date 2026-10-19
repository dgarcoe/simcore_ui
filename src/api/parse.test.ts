import { describe, expect, it } from 'vitest';
import { parseAction, parseInteraction } from './parse';

describe('parseAction', () => {
  it.each([
    ['moves to Town Clinic', { kind: 'move', target: 'Town Clinic' }],
    [
      'says to Mayor Thompson: "Hey Mayor Thompson, how\'s business today?"',
      { kind: 'speak', target: 'Mayor Thompson', content: "Hey Mayor Thompson, how's business today?" },
    ],
    ['says to Rosa: "Note: "quoted" text"', { kind: 'speak', target: 'Rosa', content: 'Note: "quoted" text' }],
    ['trades with Rosa: looking to buy some supplies', { kind: 'trade', target: 'Rosa', content: 'looking to buy some supplies' }],
    ['interacts with Hank: shakes hands', { kind: 'interact', target: 'Hank', content: 'shakes hands' }],
    ['works: organizing inventory', { kind: 'work', content: 'organizing inventory' }],
    ['posts online: hello town', { kind: 'post', content: 'hello town' }],
    ['observes surroundings', { kind: 'observe', target: '' }],
    ['observes the crowd', { kind: 'observe', target: 'the crowd' }],
    ['rests', { kind: 'rest' }],
    ['waits', { kind: 'wait' }],
    ['dances wildly', { kind: 'custom', content: 'dances wildly' }],
  ])('%s', (text, expected) => {
    expect(parseAction(text)).toEqual(expected);
  });

  it('parses private talk', () => {
    expect(parseAction('whispers to Bob, Ana: "shh"')).toEqual({ kind: 'whisper', target: 'Bob, Ana', content: 'shh' });
    expect(parseAction('invites Bob to Barn: "come alone"')).toEqual({ kind: 'invite', target: 'Bob', place: 'Barn', content: 'come alone' });
    expect(parseAction('invites Bob to somewhere quiet')).toEqual({ kind: 'invite', target: 'Bob', place: 'somewhere quiet', content: '' });
    expect(parseAction('follows Bob')).toEqual({ kind: 'follow', target: 'Bob' });
    expect(parseAction('looks for Padre Julián')).toEqual({ kind: 'find', target: 'Padre Julián' });
  });

  it('handles null', () => {
    expect(parseAction(null)).toEqual({ kind: 'custom', content: '' });
  });
});

describe('parseInteraction', () => {
  it('parses trades', () => {
    expect(parseInteraction('Dr. Amara trades with Rosa: proposing a collaboration')).toEqual({
      initiator: 'Dr. Amara',
      target: 'Rosa',
      kind: 'trade',
      content: 'proposing a collaboration',
    });
  });
  it('returns null on unknown text', () => {
    expect(parseInteraction('something happened')).toBeNull();
  });
});

describe('item actions', () => {
  it('parses gives, takes, leaves, uses, offers, accepts and declines', () => {
    expect(parseAction('gives Bruno 2 food')).toEqual({ kind: 'give', target: 'Bruno', amount: 2, item: 'food' });
    expect(parseAction('gives Padre Julián 1 medicine')).toMatchObject({ target: 'Padre Julián', item: 'medicine' });
    expect(parseAction('takes 1 medicine')).toEqual({ kind: 'take', amount: 1, item: 'medicine' });
    expect(parseAction('leaves 3 money here')).toEqual({ kind: 'drop', amount: 3, item: 'money' });
    expect(parseAction('uses medicine on Tomás')).toEqual({ kind: 'use', item: 'medicine', target: 'Tomás' });
    expect(parseAction('uses food')).toEqual({ kind: 'use', item: 'food', target: '' });
    expect(parseAction('offers Ana 5 money for 2 food')).toEqual({ kind: 'offer', target: 'Ana', amount: 5, item: 'money', askAmount: 2, askItem: 'food' });
    expect(parseAction('offers Ana 1 ammo')).toMatchObject({ kind: 'offer', item: 'ammo', askItem: '' });
    expect(parseAction('accepts the offer from Ana')).toEqual({ kind: 'accept', target: 'Ana' });
    expect(parseAction('declines the offer from Ana')).toEqual({ kind: 'decline', target: 'Ana' });
    expect(parseAction('trades with Ana: old style')).toMatchObject({ kind: 'trade' });
  });
});
