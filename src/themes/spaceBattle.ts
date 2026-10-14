import { HAIR, P, SKIN } from './palette';
import type { ThemePack } from './types';

export const spaceBattle: ThemePack = {
  id: 'space-battle',
  label: 'Batalla espacial',
  layout: 'void',
  keywords: [
    /battle|batalla|batalha|war\b|guerra|fleet|flota|frota|armada|squadron|escuadr[oó]n|esquadr/gi,
    /cruiser|crucero|frigate|fragata|destroyer|destructor|fighter|caza|dogfight|carrier|portanaves|mothership|nodriza|asteroid|asteroide|orbit|[oó]rbita|space|espacio|espa[cç]o/gi,
  ],
  background: '#070812',
  ground: { base: '#070812', alt: '#0c0e1c', detail: '#1a1d33' },
  path: { base: '#41a6f6', edge: '#29366f' },
  plaza: { base: '#2b3350', alt: '#232a44' },
  wall: { top: '#6b7a99', face: '#3a4360', trim: P.cyan },
  floors: {
    generic: { pattern: 'deck', base: '#4b5470', alt: '#414960' },
    command: { pattern: 'carpet', base: P.navy, alt: P.blue },
    medical: { pattern: 'tiles', base: '#dfe8f0', alt: '#b9c8d6' },
    combat: { pattern: 'grate', base: '#5a2c3a', alt: '#3e1e29' },
    engineering: { pattern: 'grate', base: '#4a4f63', alt: '#2d3142' },
    storage: { pattern: 'hazard', base: '#555a6b', alt: P.yellow },
    transit: { pattern: 'hazard', base: '#555a6b', alt: P.orange },
  },
  buildings: {
    generic: { wall: '#8b93a8', roof: P.sky },
    combat: { wall: '#9ca3b0', roof: P.red },
    command: { wall: '#c2c7d1', roof: P.blue },
    transit: { wall: '#a59b8a', roof: P.orange },
    medical: { wall: '#e6eef5', roof: P.red },
    engineering: { wall: '#7d8596', roof: P.yellow },
  },
  decor: {
    generic: ['console', 'crate', 'locker', 'screen'],
    combat: ['turret', 'turret', 'console', 'screen'],
    command: ['console', 'screen', 'console', 'screen'],
    medical: ['medbed', 'medbed', 'screen', 'locker'],
    engineering: ['machine', 'console', 'barrel', 'machine'],
    transit: ['crate', 'barrel', 'locker', 'console'],
    storage: ['crate', 'crate', 'barrel', 'shelf'],
  },
  propColors: {
    o: P.ink, m: '#9aa8c0', M: '#5b6684', w: '#7a8299', W: '#565d73', a: P.cyan, A: P.teal, l: P.white,
    k: '#141726', g: P.green, G: P.teal, t: P.brown, r: '#8a7f73', R: '#5a524b', f: P.yellow, F: P.orange, x: '#c8d4e3', X: '#94a3b8',
  },
  agent: {
    outfits: [P.red, P.blue, P.slate, P.orange],
    hair: HAIR,
    skin: SKIN,
    pants: [P.charcoal, P.navy],
    headgear: ['helmet', 'helmet', null],
    headgearColor: '#e6eef5',
  },
  ambient: 'stars',
  ui: { accent: P.sky, label: P.cyan, labelBg: 'rgba(7,8,18,0.8)' },
};
