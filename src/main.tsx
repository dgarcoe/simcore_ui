import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
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

void fontsReady().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
