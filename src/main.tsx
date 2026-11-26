import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { parsePlayLink } from './api/games';
import { parseReplayHash } from './store/review';
import { DmGate } from './ui/DmGate';
import './styles.css';

// Phaser draws text into textures, so the pixel font must be ready first.
async function fontsReady(): Promise<void> {
  try {
    await Promise.race([
      Promise.all([document.fonts.load('8px "Press Start 2P"'), document.fonts.load('16px "VT323"')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* fall back to monospace */
  }
}

void fontsReady().then(async () => {
  // Players open #/jugar/<code>: their own small app, without the map or the DM's API.
  const play = parsePlayLink(location);
  const root = createRoot(document.getElementById('root')!);
  if (play) {
    const { PlayerApp } = await import('./player/PlayerApp');
    root.render(
      <StrictMode>
        <PlayerApp code={play.code} linkToken={play.token} />
      </StrictMode>,
    );
  } else {
    const { App } = await import('./App');
    root.render(
      <StrictMode>
        <DmGate>
          <App />
        </DmGate>
      </StrictMode>,
    );
  }
  // A link to a moment of a replay (#replay=…&t=13&agente=Toro): open it there.
  const openLink = async () => {
    const link = parseReplayHash(location.hash);
    if (!link) return;
    const { startReplay, startRun } = await import('./store/sources');
    const at = { tick: link.tick, agent: link.agent };
    try {
      if (link.file) await startReplay(link.file, at);
      else if (link.run) await startRun(link.run, at);
    } catch (e) {
      console.warn('No se pudo abrir el enlace a la repetición', e);
    }
  };
  if (!play) void openLink();
  // Switching between a game link and the DM's screen needs a fresh start.
  window.addEventListener('hashchange', () => {
    if (!!parsePlayLink(location) !== !!play) location.reload();
    else if (!play) void openLink();
  });
});
