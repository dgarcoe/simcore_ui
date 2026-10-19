import { useMemo, useRef, useState } from 'react';
import { parse, stringify } from 'yaml';
import * as api from '../../api/client';
import { cleanScenario, configToEnvironment, scenarioWarnings, validateScenario } from '../../api/scenario';
import { useSim } from '../../store/simStore';
import { leave, runScenario } from '../../store/sources';
import { resolveTheme } from '../../themes/registry';
import { AgentsTab } from './AgentsTab';
import { normalize, useDraft } from './draft';
import { EventsTab } from './EventsTab';
import { GeneralTab } from './GeneralTab';
import { ActionsTab } from './ActionsTab';
import { ConditionsTab } from './ConditionsTab';
import { ItemsTab } from './ItemsTab';
import { WorldTab } from './WorldTab';
import { LocationsTab } from './LocationsTab';
import { MapPreview } from './MapPreview';
import { useDemoPref } from '../demoPref';

type Tab = 'general' | 'places' | 'agents' | 'items' | 'conditions' | 'actions' | 'world' | 'events';

export function ScenarioEditor() {
  const [draft, update] = useDraft();
  const editing = useSim((s) => s.editing)!;
  const [tab, setTab] = useState<Tab>('general');
  const [selectedLoc, setSelectedLoc] = useState<number | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useDemoPref();
  const [speed, setSpeed] = useState(2);
  const fileRef = useRef<HTMLInputElement>(null);

  const issues = useMemo(() => validateScenario(draft), [draft]);
  const warnings = useMemo(() => scenarioWarnings(draft), [draft]);
  const theme = useMemo(
    () =>
      resolveTheme({
        scenarioName: draft.simulation.name,
        scenarioDescription: draft.simulation.description,
        env: configToEnvironment(draft),
      }).theme,
    [draft],
  );

  // Saving overwrites the scenario being edited (built-in ones too: Simcore keeps the edits
  // apart and can restore the original). "Guardar copia" creates a new one.
  const save = async (asCopy = false): Promise<string | null> => {
    setBusy(true);
    setStatus(null);
    try {
      const payload = cleanScenario(draft);
      if (asCopy && !/\(copia\)$/.test(payload.simulation.name)) payload.simulation.name += ' (copia)';
      const id = asCopy ? null : editing.id;
      const rec = await api.saveScenario(payload, id);
      useSim.getState().set({ editing: { id: rec.id, builtin: rec.builtin, draft: normalize(rec.data ?? payload) } });
      setStatus({ kind: 'ok', text: asCopy || !id ? `Guardado como «${payload.simulation.name}».` : `Cambios guardados en «${payload.simulation.name}».` });
      return rec.id;
    } catch (e) {
      setStatus({ kind: 'error', text: `No se pudo guardar: ${(e as Error).message}. ¿Está Simcore en marcha?` });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const saveAndRun = async () => {
    const id = await save();
    if (!id) return;
    try {
      await runScenario(id, demo, speed);
    } catch (e) {
      setStatus({ kind: 'error', text: `No se pudo ejecutar: ${(e as Error).message}` });
    }
  };

  const exportYaml = () => {
    const blob = new Blob([stringify(cleanScenario(draft))], { type: 'text/yaml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(draft.simulation.name || 'scenario').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.yaml`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importYaml = async (file: File) => {
    try {
      const data = parse(await file.text());
      if (!data?.simulation || !data?.environment) throw new Error('no parece un escenario de Simcore');
      update((d) => Object.assign(d, normalize(data)));
      setStatus({ kind: 'ok', text: `Importado ${file.name}.` });
    } catch (e) {
      setStatus({ kind: 'error', text: `No se pudo importar: ${(e as Error).message}` });
    }
  };

  const tabs: Array<[Tab, string]> = [
    ['general', 'General'],
    ['places', `Lugares ${draft.environment.locations.length}`],
    ['agents', `Agentes ${draft.agents.length}`],
    ['items', `Objetos ${Object.keys(draft.items ?? {}).length}`],
    ['conditions', `Estados ${Object.keys(draft.conditions ?? {}).length}`],
    ['actions', `Acciones ${Object.keys(draft.actions ?? {}).length}`],
    ['world', `Mundo ${Object.keys(draft.needs ?? {}).length + (draft.rules?.length ?? 0)}`],
    ['events', `Sucesos ${draft.events?.scheduled?.length ?? 0}`],
  ];

  return (
    <div className="app" style={{ ['--accent' as string]: theme.ui.accent }}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◆</span> SIMCORE<span className="brand-dim">·EDITOR</span>
        </div>
        <div className="scenario">
          <div className="scenario-name">{draft.simulation.name || 'Nuevo escenario'}</div>
          <div className="clock">
            {editing.id ? (editing.builtin ? 'Escenario incluido · los cambios se guardan sobre él' : `Escenario ${editing.id}`) : 'Sin guardar'}
          </div>
        </div>
        <div className="controls">
          <input ref={fileRef} type="file" accept=".yaml,.yml" hidden onChange={(e) => e.target.files?.[0] && importYaml(e.target.files[0])} />
          <button className="btn" onClick={() => fileRef.current?.click()}>Importar YAML</button>
          <button className="btn" onClick={exportYaml}>Exportar YAML</button>
          <button className="btn" disabled={busy || issues.length > 0} onClick={() => save()}>
            Guardar
          </button>
          {editing.id && (
            <button className="btn" disabled={busy || issues.length > 0} title="Guardar como un escenario nuevo" onClick={() => save(true)}>
              Guardar copia
            </button>
          )}
          <label className="toggle">
            <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} /> demo (sin LLM)
          </label>
          <input className="input tiny" type="number" min={0} step={0.5} value={speed} title="Segundos por tick" onChange={(e) => setSpeed(Number(e.target.value))} />
          <button className="btn btn-accent" disabled={busy || issues.length > 0} onClick={saveAndRun}>
            Guardar y ejecutar ▶
          </button>
          <button className="btn" onClick={leave} title="Volver al inicio">⏏</button>
        </div>
      </header>
      <div className="main editor">
        <section className="editor-form">
          <nav className="tabs" role="tablist">
            {tabs.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </nav>
          {(issues.length > 0 || warnings.length > 0 || status) && (
            <div className="ed-status">
              {status && <p className={status.kind === 'ok' ? 'ok-text' : 'warn'}>{status.text}</p>}
              {issues.map((i) => (
                <p key={i.path + i.message} className="warn">• {i.message}</p>
              ))}
              {warnings.map((w) => (
                <p key={w} className="dim small">ⓘ {w}</p>
              ))}
            </div>
          )}
          <div className="panel-body">
            {tab === 'general' && <GeneralTab />}
            {tab === 'places' && <LocationsTab selected={selectedLoc} onSelect={setSelectedLoc} />}
            {tab === 'agents' && <AgentsTab theme={theme} />}
            {tab === 'items' && <ItemsTab />}
            {tab === 'conditions' && <ConditionsTab />}
            {tab === 'actions' && <ActionsTab />}
            {tab === 'world' && <WorldTab />}
            {tab === 'events' && <EventsTab />}
          </div>
        </section>
        <MapPreview
          draft={draft}
          onPickLocation={(name) => {
            setTab('places');
            setSelectedLoc(draft.environment.locations.findIndex((l) => l.name === name));
          }}
        />
      </div>
    </div>
  );
}
