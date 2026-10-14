import { HAIR, P, SKIN } from './palette';
import type { ThemePack } from './types';

export const warehouse: ThemePack = {
  id: 'warehouse',
  label: 'Almacén',
  layout: 'indoor',
  keywords: [
    /warehouse|almac[eé]n|armaz[eé]m|storage|dep[oó]sito|logistic|log[ií]stic|distribution|distribuci[oó]n/gi,
    /forklift|carretilla|empilhadeira|pallet|pal[eé]|palete|\bdock|muelle|shipping|env[ií]o|inventory|inventario|stock|picking|courier|paquete/gi,
  ],
  background: '#2b2b30',
  ground: { base: '#2b2b30', alt: '#303036', detail: '#3a3a42' },
  path: { base: '#8c8c8c', edge: P.yellow },
  plaza: { base: '#8c8c8c', alt: '#7a7a7a' },
  wall: { top: '#9a5a48', face: '#6e3b30', trim: '#c27a62' },
  floors: {
    generic: { pattern: 'concrete', base: '#9a9a9a', alt: '#878787' },
    storage: { pattern: 'concrete', base: '#a3a3a3', alt: '#8f8f8f' },
    transit: { pattern: 'hazard', base: '#8c8c8c', alt: P.yellow },
    command: { pattern: 'carpet', base: P.slate, alt: '#62799a' },
    social: { pattern: 'checker', base: '#d8d0c0', alt: '#b8ad98' },
    quarters: { pattern: 'planks', base: P.wood, alt: P.brown },
    medical: { pattern: 'tiles', base: '#e6eef5', alt: '#c5d3df' },
    production: { pattern: 'grate', base: '#70747f', alt: '#555963' },
  },
  buildings: { generic: { wall: '#6e3b30', roof: P.yellow } },
  decor: {
    generic: ['shelf', 'pallet', 'crate', 'barrel'],
    storage: ['shelf', 'shelf', 'pallet', 'crate'],
    transit: ['pallet', 'crate', 'crate', 'barrel'],
    command: ['table', 'screen', 'board', 'plant'],
    social: ['table', 'bench', 'plant', 'screen'],
    quarters: ['bed', 'locker', 'locker', 'plant'],
    medical: ['medbed', 'locker', 'screen', 'plant'],
    production: ['conveyor', 'machine', 'pallet', 'crate'],
    commerce: ['shelf', 'table', 'pallet', 'board'],
  },
  propColors: {
    o: P.ink, w: P.wood, W: P.brown, m: P.silver, M: P.slate, a: P.orange, A: P.red, l: P.white, k: P.charcoal,
    x: '#d9c39a', X: '#b39a6b', g: P.green, G: P.teal, t: P.brown, r: P.silver, R: P.slate, f: P.yellow, F: P.orange,
  },
  agent: {
    outfits: [P.orange, '#c8e04a', P.orange, P.blue, P.yellow],
    hair: HAIR,
    skin: SKIN,
    pants: [P.navy, P.charcoal, '#4a5a7a'],
    headgear: ['hardhat', 'hardhat', null],
    headgearColor: P.yellow,
  },
  ambient: 'dust',
  ui: { accent: P.yellow, label: P.yellow, labelBg: 'rgba(22,22,26,0.8)' },
};
