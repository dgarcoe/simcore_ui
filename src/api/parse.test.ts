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
