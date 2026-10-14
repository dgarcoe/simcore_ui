import { useDeferredValue, useEffect, useMemo, useRef } from 'react';
import { configToEnvironment, mapHints, type ScenarioConfig } from '../../api/scenario';
import { TILE } from '../../game/art/paintMap';
import { renderPreview } from '../../game/art/preview';
import { generateMap } from '../../game/map/model';
import { resolveTheme, type ThemeSource } from '../../themes/registry';

const SOURCE_LABEL: Record<ThemeSource, string> = {
  manual: 'manual',
  scenario: 'elegido en el escenario',
  override: 'configurado',
  heuristic: 'detectado',
  default: 'por defecto',
};

interface Props {
  draft: ScenarioConfig;
  onPickLocation: (name: string) => void;
}

/** Live preview: the same procedural map the simulation will use, regenerated as you edit. */
export function MapPreview({ draft: liveDraft, onPickLocation }: Props) {
  const draft = useDeferredValue(liveDraft);
  const hostRef = useRef<HTMLDivElement>(null);

  const { canvas, map, theme, source } = useMemo(() => {
    const env = configToEnvironment(draft);
    const { theme, source } = resolveTheme({
      scenarioName: draft.simulation.name,
      scenarioDescription: draft.simulation.description,
      env,
    });
    const hasZones = Object.values(env.locations).some((l) => !l.virtual);
    if (!hasZones) return { canvas: null, map: null, theme, source };
    const map = generateMap(env, theme.layout, draft.simulation.name || 'preview', mapHints(draft));
    return { canvas: renderPreview(map, theme, draft), map, theme, source };
  }, [draft]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren();
    if (canvas) {
      canvas.className = 'preview-canvas';
      host.appendChild(canvas);
    }
  }, [canvas]);

  return (
    <div className="preview">
      <div className="preview-head">
        <span>
          Vista previa · <strong>{theme.label}</strong>
          <span className="dim"> ({SOURCE_LABEL[source]})</span>
        </span>
        {map && <span className="dim">{map.zones.length} zonas · {map.cols}×{map.rows} casillas</span>}
      </div>
      <div
        ref={hostRef}
        className="preview-host"
        style={{ background: theme.background }}
        onClick={(e) => {
          if (!map || !canvas) return;
          const r = (e.target as HTMLElement).getBoundingClientRect();
          const tx = Math.floor(((e.clientX - r.left) / r.width) * canvas.width / TILE);
          const ty = Math.floor(((e.clientY - r.top) / r.height) * canvas.height / TILE);
          const zone = map.zones.find((z) => tx >= z.body.x - 1 && tx <= z.body.x + z.body.w && ty >= z.body.y - 2 && ty <= z.body.y + z.body.h + 3);
          if (zone) onPickLocation(zone.name);
        }}
      />
      {!canvas && <p className="empty">Añade un lugar para ver el mapa.</p>}
    </div>
  );
}
