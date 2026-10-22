import '../style.css';
import './demo.css';

// Demo entry: every visit starts with the walk-in and the tutorial at the shelf, then the visitor walks the room.
// (`shouldPlayIntro` / `hasSavedDemoRoom` decided first visits before; `/` now always plays, see planIntro.)

function storage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

const root = document.getElementById('room')!;

import('./demo-app')
  .then(({ startDemo }) => startDemo(root, storage()))
  .catch((error: unknown) => {
    console.error('demo failed', error);
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.className = 'demo-error';
    message.textContent = error instanceof Error ? error.message : String(error);
    root.append(message);
  });
