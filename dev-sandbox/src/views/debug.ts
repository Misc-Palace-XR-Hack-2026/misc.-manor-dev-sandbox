import type { Store } from '../core/store';
import type { SoundtrackPlayer } from './soundtrack';

// Opt-in (?debug=1) read-only panel for developers: what the store thinks is true right now.
// Text only, no controls, so it can never change room data.

export function createDebugPanel(store: Store, player: SoundtrackPlayer): HTMLElement {
  const panel = document.createElement('pre');
  panel.className = 'debug-panel';
  panel.setAttribute('aria-label', 'Debug');
  const render = () => {
    const { state, layout } = store;
    const free = layout.slots.length - state.placements.length;
    const lines: [string, string][] = [
      ['room', `${store.roomId ?? '(legacy)'} - ${state.owner}`],
      ['layout', `${layout.id} (${layout.slots.length} slots, ${free} free)`],
      ['look', `lighting ${state.lighting ?? 'original'}, soundtrack ${state.soundtrack?.mode ?? 'follow'}`],
      ['content', `${state.contentItems.length} items, ${state.representations.length} objects, ${state.placements.length} placed`],
      ['selected', store.selectedId ?? '-'],
      ['holding', store.holding ?? '-'],
      ['music', player.soundState],
      ['undo', store.canUndo ? 'available' : 'empty'],
      ['save', store.saveError ?? 'ok'],
    ];
    panel.textContent = lines.map(([k, v]) => `${k.padEnd(8)}${v}`).join('\n');
  };
  store.subscribe(render);
  player.subscribe(render);
  return panel;
}
