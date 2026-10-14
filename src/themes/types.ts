import type { LayoutKind } from '../game/map/model';
import type { ZoneRole } from '../game/map/roles';

export type FloorPattern = 'tiles' | 'planks' | 'carpet' | 'grate' | 'concrete' | 'checker' | 'hazard' | 'deck' | 'soil';

export interface FloorStyle {
  pattern: FloorPattern;
  base: string;
  alt: string;
}

export interface BuildingStyle {
  /** Outdoor: facade. Void: hull plating. */
  wall: string;
  /** Outdoor: roof. Void: accent stripe / engines. */
  roof: string;
}

type ByRole<T> = Partial<Record<ZoneRole, T>> & { generic: T };

/**
 * A theme turns the abstract map model into pixel art. Adding a theme means
 * adding one of these; the map generator and the scene never change.
 */
export interface ThemePack {
  id: string;
  label: string;
  layout: LayoutKind;
  /** Words that suggest this theme when guessing it from scenario text. */
  keywords: RegExp[];
  background: string;
  /** Outdoor terrain, or whatever lies outside rooms indoors. */
  ground: { base: string; alt: string; detail: string };
  /** Outdoor road, indoor corridor or void lane. */
  path: { base: string; edge: string };
  plaza: { base: string; alt: string };
  wall: { top: string; face: string; trim: string };
  floors: ByRole<FloorStyle>;
  buildings: ByRole<BuildingStyle>;
  /** Furniture keys (see PROPS) used to decorate each kind of zone. */
  decor: ByRole<string[]>;
  /** Colors for prop palette slots (o, m, M, w, W, a, A, l, g, G, t, r, R, f, F, k, x, X). */
  propColors: Record<string, string>;
  agent: {
    outfits: string[];
    hair: string[];
    skin: string[];
    pants: string[];
    headgear: Array<string | null>;
    headgearColor: string;
  };
  ambient: 'none' | 'stars' | 'dust' | 'sparks';
  ui: { accent: string; label: string; labelBg: string };
}

export function floorFor(theme: ThemePack, role: ZoneRole): FloorStyle {
  return theme.floors[role] ?? theme.floors.generic;
}

export function buildingFor(theme: ThemePack, role: ZoneRole): BuildingStyle {
  return theme.buildings[role] ?? theme.buildings.generic;
}

export function decorFor(theme: ThemePack, role: ZoneRole): string[] {
  return theme.decor[role] ?? theme.decor.generic;
}
