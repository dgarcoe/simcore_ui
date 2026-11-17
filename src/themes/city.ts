import { HAIR, P, SKIN } from './palette';
import type { ThemePack } from './types';

/** A sunny, neon-lit city in the style of crime sandbox games: asphalt, pastel blocks, palms. */
export const city: ThemePack = {
  id: 'city',
  label: 'Ciudad',
  layout: 'outdoor',
  urban: true,
  scenery: ['lamp', 'lamp', 'car', 'car', 'car', 'hydrant', 'bin', 'palm', 'palm', 'cone'],
  keywords: [
    /\bcity\b|ciudad|cidade|downtown|metr[oó]poli|los santos|vice|street|calle|rua|avenida|avenue|barrio|bairro|ghetto|block/gi,
    /gang|banda|pandill|mafia|cartel|crew|police|polic[ií]a|comisar[ií]a|club|puerto|taller|garage|garaje|heist|atraco|turf|territor/gi,
  ],
  background: '#3a3d4a',
  // pavement (the ground between roads and blocks)
  ground: { base: '#b9b4a8', alt: '#aaa598', detail: '#8f8a7e' },
  // asphalt road, curb
  path: { base: '#34363f', edge: '#cfcabe' },
  plaza: { base: '#d8c9a8', alt: '#c9b994' },
  wall: { top: P.slate, face: P.charcoal, trim: P.silver },
  floors: {
    generic: { pattern: 'concrete', base: '#b9b4a8', alt: '#aaa598' },
    agriculture: { pattern: 'concrete', base: '#4a4c56', alt: '#42444d' },
    leisure: { pattern: 'tiles', base: '#5cc46f', alt: '#4fb062' },
  },
  // facade, roof (flat, seen from above)
  buildings: {
    generic: { wall: '#e7c6a1', roof: '#6b6f7d' },
    medical: { wall: P.white, roof: '#8e95a5' },
    commerce: { wall: '#f2a7c3', roof: '#5f6372' },
    social: { wall: '#b49bd9', roof: '#5f6372' },
    education: { wall: '#f6d38c', roof: '#666a78' },
    quarters: { wall: '#9fd8cf', roof: '#5a5e6c' },
    command: { wall: '#7aa3d9', roof: '#4a4e5c' },
    production: { wall: '#c7b199', roof: '#5b4e45' },
    storage: { wall: '#a9a39a', roof: '#565049' },
    engineering: { wall: '#d6a25e', roof: '#565a66' },
    transit: { wall: '#e8dcc8', roof: P.teal },
    combat: { wall: '#7c7f6a', roof: '#4b4f3a' },
    agriculture: { wall: '#4a4c56', roof: P.yellow },
    leisure: { wall: P.green, roof: P.teal },
  },
  decor: { generic: ['bench', 'plant', 'barrel', 'crate'] },
  propColors: {
    o: P.ink, g: '#2a8f50', G: '#1e6646', l: '#7fd47a', t: P.brown,
    r: P.silver, R: P.slate, f: '#ff3fa4', F: '#3fe8ff',
    w: P.wood, W: P.brown, m: P.silver, M: P.slate, a: P.sky, A: P.navy, k: P.charcoal, x: P.white, X: P.silver,
  },
  agent: {
    outfits: ['#ff3fa4', '#3fe8ff', P.yellow, P.green, P.orange, P.white, '#b14fd6', P.red],
    hair: HAIR,
    skin: SKIN,
    pants: [P.navy, P.charcoal, '#2b2d36', P.slate, '#3a5a8c'],
    headgear: [null, null, 'cap', 'cap'],
    headgearColor: '#ff3fa4',
  },
  ambient: 'none',
  ui: { accent: '#ff3fa4', label: P.white, labelBg: 'rgba(26,28,44,0.8)' },
};
