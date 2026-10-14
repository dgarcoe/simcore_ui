import { decorFor, type ThemePack } from '../../themes/types';
import { resourceSprite } from '../map/model';
import type { ZoneRole } from '../map/roles';

/** Turns a semantic map prop key into the sprite name a theme draws for it. */
export function propSprite(theme: ThemePack, key: string): string {
  if (key.startsWith('decor:')) {
    const [, role, n] = key.split(':');
    const options = decorFor(theme, role as ZoneRole);
    return options[Number(n) % options.length];
  }
  if (key.startsWith('resource:')) return resourceSprite(key.slice('resource:'.length));
  return key;
}
