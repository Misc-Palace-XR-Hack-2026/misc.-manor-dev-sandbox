import '../style.css';
import './demo.css';
import { shouldPlayIntro } from '../core/intro-timeline';

// Demo entry: the visitor's regular room, entered from its open east side. First visit (or ?intro, or /intro): a
// walk-in, then a locked tutorial at the shelf. Everyone else lands straight in their open room.

function storage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

const root = document.getElementById('room')!;

import('./demo-app')
  .then(({ startDemo }) => startDemo(root, shouldPlayIntro(storage(), location.search), storage(), location.search))
  .catch((error: unknown) => {
    console.error('demo failed', error);
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.className = 'demo-error';
    message.textContent = error instanceof Error ? error.message : String(error);
    root.append(message);
  });
