import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { parsePlayHash } from './api/games';
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
  const play = parsePlayHash(location.hash);
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
  // Switching between a game link and the DM's screen needs a fresh start.
  window.addEventListener('hashchange', () => {
    if (!!parsePlayHash(location.hash) !== !!play) location.reload();
  });
});
