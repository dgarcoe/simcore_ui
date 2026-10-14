import { HAIR, P, SKIN } from './palette';
import type { ThemePack } from './types';

export const factory: ThemePack = {
  id: 'factory',
  label: 'Fábrica',
  layout: 'indoor',
  keywords: [
    /factory|f[aá]brica|assembly|montaje|montagem|production line|l[ií]nea de producci[oó]n|linha de produ|manufactur|industrial|foundry|fundici[oó]n|forge|steel|acero/gi,
    /worker|obrer|oper[aá]ri|shift|turno|machine|m[aá]quina|union|sindicato|strike|huelga|greve|foreman|capataz|conveyor|cinta/gi,
  ],
  background: '#24262e',
  ground: { base: '#24262e', alt: '#282a33', detail: '#30333d' },
  path: { base: '#5b6070', edge: P.yellow },
  plaza: { base: '#5b6070', alt: '#4c5060' },
  wall: { top: '#7d8596', face: '#4f5668', trim: P.yellow },
  floors: {
    generic: { pattern: 'concrete', base: '#7f8490', alt: '#6c717c' },
    production: { pattern: 'grate', base: '#5b6070', alt: '#434752' },
    engineering: { pattern: 'grate', base: '#5b6070', alt: '#3c404b' },
    storage: { pattern: 'hazard', base: '#7f8490', alt: P.yellow },
    transit: { pattern: 'hazard', base: '#7f8490', alt: P.orange },
    command: { pattern: 'carpet', base: P.navy, alt: '#34448a' },
    social: { pattern: 'checker', base: '#c9c0ae', alt: '#a69c88' },
    medical: { pattern: 'tiles', base: '#e6eef5', alt: '#c5d3df' },
    quarters: { pattern: 'planks', base: P.wood, alt: P.brown },
  },
  buildings: { generic: { wall: '#4f5668', roof: P.yellow } },
  decor: {
    generic: ['machine', 'conveyor', 'barrel', 'crate'],
    production: ['machine', 'conveyor', 'conveyor', 'machine'],
    engineering: ['machine', 'console', 'barrel', 'machine'],
    storage: ['pallet', 'crate', 'barrel', 'shelf'],
    transit: ['pallet', 'crate', 'barrel', 'crate'],
    command: ['console', 'screen', 'board', 'table'],
    social: ['table', 'bench', 'plant', 'table'],
    medical: ['medbed', 'locker', 'screen', 'plant'],
    quarters: ['locker', 'bench', 'locker', 'plant'],
  },
  propColors: {
    o: P.ink, m: '#a3abb8', M: '#5f6675', w: P.wood, W: P.brown, a: P.orange, A: P.red, l: P.yellow, k: '#1d1f26',
    x: '#d9c39a', X: '#b39a6b', g: P.green, G: P.teal, t: P.brown, r: P.silver, R: P.slate, f: P.yellow, F: P.orange,
  },
  agent: {
    outfits: [P.blue, '#2d4a8a', P.orange, P.slate, P.teal],
    hair: HAIR,
    skin: SKIN,
    pants: [P.navy, P.charcoal],
    headgear: ['hardhat', 'hardhat', 'hardhat', null],
    headgearColor: P.yellow,
  },
  ambient: 'sparks',
  ui: { accent: P.orange, label: P.yellow, labelBg: 'rgba(18,19,24,0.8)' },
};
