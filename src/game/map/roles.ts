import type { Location } from '../../api/types';

// Semantic role of a location, independent of the visual theme. Themes decide
// how each role looks (a `medical` zone is a clinic in a town and a medbay
// aboard a spaceship).
export const ZONE_ROLES = [
  'medical',
  'commerce',
  'storage',
  'production',
  'engineering',
  'command',
  'quarters',
  'social',
  'education',
  'agriculture',
  'leisure',
  'transit',
  'combat',
  'generic',
] as const;

export type ZoneRole = (typeof ZONE_ROLES)[number];

const TYPE_ROLES: Record<string, ZoneRole> = {
  healthcare: 'medical',
  medical: 'medical',
  hospital: 'medical',
  commercial: 'commerce',
  market: 'commerce',
  retail: 'commerce',
  storage: 'storage',
  warehouse: 'storage',
  logistics: 'storage',
  industrial: 'production',
  factory: 'production',
  production: 'production',
  manufacturing: 'production',
  engineering: 'engineering',
  government: 'command',
  administrative: 'command',
  command: 'command',
  military: 'combat',
  combat: 'combat',
  residential: 'quarters',
  housing: 'quarters',
  quarters: 'quarters',
  social: 'social',
  religious: 'social',
  education: 'education',
  research: 'education',
  agricultural: 'agriculture',
  agriculture: 'agriculture',
  leisure: 'leisure',
  recreation: 'leisure',
  transport: 'transit',
  transit: 'transit',
};

// Keyword fragments (en / es / pt) matched against names and descriptions.
const KEYWORD_ROLES: Array<[ZoneRole, RegExp]> = [
  ['medical', /clinic|cl[ií]nica|hospital|infirmar|enfermer|medbay|med bay|sick ?bay|pharmac|farm[aá]cia/i],
  ['command', /bridge|puente|ponte de comando|command|mando|town hall|city hall|ayuntamiento|prefeitura|council|office|oficina|escrit[oó]rio|control room|sala de control/i],
  ['engineering', /engine|reactor|motor|m[aá]quinas|power|energ[ií]a|generator|generador/i],
  ['storage', /warehouse|storage|cargo|almac[eé]n|bodega|armaz[eé]m|dep[oó]sito|depot|shelv|estanter/i],
  ['production', /factory|f[aá]brica|assembly|montaje|workshop|taller|oficina mec|\bplant\b|planta\b|forge|foundry|mill|line \d|l[ií]nea/i],
  ['transit', /dock|muelle|hangar|airlock|esclusa|\bport\b|spaceport|puerto|station|estaci[oó]n|loading|carga y descarga|garage|garaje/i],
  ['combat', /turret|torreta|weapon|arma|armory|arsenal|cannon|ca[ñn][oó]n|fleet|flota|fighter|caza|cruiser|crucero|frigate|fragata|destroyer|battle|batalla|batalha/i],
  ['quarters', /quarters|camarote|cabin|dorm|barrack|home|house|casa|vivienda|residen|apartment|bunk|litera/i],
  ['social', /caf[eé]|cafeter|canteen|cantina|\bmess\b|comedor|bar\b|pub|tavern|church|iglesia|igreja|plaza|pra[cç]a|square|lounge|sal[oó]n|chapel/i],
  ['education', /school|escuela|escola|class|aula|lab|laborator|library|biblioteca|university/i],
  ['agriculture', /farm|granja|fazenda|field|campo|crop|cultivo|hydropon|hidrop|greenhouse|invernadero|garden|huerto/i],
  ['leisure', /park|parque|gym|gimnasio|pool|piscina|beach|playa|praia|arcade|holodeck/i],
  ['commerce', /store|shop|tienda|loja|market|mercado|mercearia|bakery|panader|padaria|bank|banco|restaurant/i],
];

export function roleFromText(text: string): ZoneRole | null {
  for (const [role, re] of KEYWORD_ROLES) if (re.test(text)) return role;
  return null;
}

function isRole(v: unknown): v is ZoneRole {
  return typeof v === 'string' && (ZONE_ROLES as readonly string[]).includes(v);
}

/**
 * Priority: explicit `properties.ui_role` in the scenario YAML, then the
 * location `type`, then keywords in the name, then in the description.
 */
export function resolveRole(loc: Pick<Location, 'name' | 'type' | 'properties'>): ZoneRole {
  const props = loc.properties ?? {};
  if (isRole(props.ui_role)) return props.ui_role;
  const byType = TYPE_ROLES[(loc.type ?? '').toLowerCase()];
  if (byType) return byType;
  return roleFromText(loc.name) ?? roleFromText(String(props.description ?? '')) ?? 'generic';
}
