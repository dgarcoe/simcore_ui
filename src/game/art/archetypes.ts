// Maps an agent's profession (free text in en/es/pt) to how it is dressed.

import { P } from '../../themes/palette';

export interface Archetype {
  id: string;
  /** Shirt/coat color; undefined keeps the theme's per-agent color. */
  shirt?: string;
  pants?: string;
  /** Headgear sprite; null forces none, undefined keeps the theme's choice. */
  headgear?: string | null;
  gearColor?: string;
}

const ARCHETYPES: Array<[RegExp, Archetype]> = [
  [/pilot|piloto|wing leader|aviador/i, { id: 'pilot', shirt: '#5a6e3a', headgear: 'helmet', gearColor: '#e6eef5' }],
  [/doctor|physician|m[eé]dic|nurse|enfermer|surgeon|cirujan|cirurgi|paramedic|param[eé]dic/i, { id: 'medic', shirt: P.white, pants: P.silver, headgear: null }],
  [/scien|cient[ií]fic|research|investigador|pesquisador|chemist|qu[ií]mic|biolog/i, { id: 'scientist', shirt: '#e6eef5', pants: P.charcoal, headgear: null }],
  [/cook|chef|cociner|cozinh|baker|panader|padeiro/i, { id: 'cook', shirt: P.white, pants: P.charcoal, headgear: 'chef', gearColor: P.white }],
  [/farmer|granjer|agricult|fazendeir|campesin|rancher|ganader/i, { id: 'farmer', shirt: '#4f7a3a', pants: '#3b5dc9', headgear: 'straw', gearColor: '#e3c16f' }],
  [/engineer|ingenier|engenheir|mechanic|mec[aá]nic|technician|t[eé]cnic|maintenance|mantenimiento|manuten|electrician|electricist/i, { id: 'engineer', shirt: P.orange, pants: P.navy, headgear: 'hardhat', gearColor: P.yellow }],
  [/worker|obrer|oper[aá]ri|operator|forklift|carretiller|packer|empacador|picker|foreman|capataz|miner|minero|welder|soldador|apprentice|aprendiz|line /i, { id: 'worker', shirt: '#2d4a8a', pants: P.charcoal, headgear: 'hardhat', gearColor: P.yellow }],
  [/security|seguridad|seguran[cç]a|police|polic[ií]|guard|guardia|sheriff|marine|soldier|soldado|sergeant|sargento/i, { id: 'security', shirt: '#29366f', pants: P.ink, headgear: 'cap', gearColor: '#1f2a55' }],
  [/captain|capit[aá]n|capit[aã]o|admiral|almirante|commander|comandante|general|officer|oficial/i, { id: 'officer', shirt: '#1f2a55', pants: P.ink, headgear: 'cap', gearColor: '#1f2a55' }],
  [/mayor|alcalde|prefeito|manager|gerente|director|diretor|supervisor|ceo|executive|ejecutiv|boss|jefe|chefe|politic|pol[ií]tic|senator|senador|lawyer|abogad|advogad|banker|banquer/i, { id: 'executive', shirt: P.charcoal, pants: P.ink, headgear: null }],
  [/pastor|priest|sacerdote|padre|vicar|monk|monje|nun|monja|rabbi|imam/i, { id: 'clergy', shirt: P.ink, pants: P.ink, headgear: null }],
  [/teacher|profesor|professor|maestr|educador|tutor/i, { id: 'teacher', shirt: P.plum, pants: P.charcoal }],
  [/student|estudiante|estudante|alumn|pupil|kid|niñ|crian[cç]a|teen/i, { id: 'student', shirt: P.sky, pants: P.navy, headgear: null }],
  [/merchant|comerciante|shop|tender|vendedor|seller|store owner|due[ñn]o|cashier|cajer/i, { id: 'merchant', shirt: '#b5804f', pants: P.brown }],
];

export function archetypeFor(profession: string | undefined | null): Archetype | null {
  if (!profession) return null;
  for (const [re, a] of ARCHETYPES) if (re.test(profession)) return a;
  return null;
}
