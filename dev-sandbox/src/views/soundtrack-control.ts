import type { SoundtrackPlayer } from './soundtrack';

/** Session-only listening control; never edits the room's saved music choice. */
export function createSoundtrackControl(player: SoundtrackPlayer): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'soundtrack-control';
  // Static decorative SVG: a speaker with either waves or a slash.
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M11 5 6 9H3v6h3l5 4Z"/><g class="sound-waves"><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></g><path class="sound-slash" d="m3 3 18 18"/></svg>';
  // A touchend/keydown bubbles before the native click. Don't let the global
  // autoplay retry start music first and turn that same click into a mute.
  for (const event of ['touchend', 'keydown']) button.addEventListener(event, e => e.stopPropagation());
  button.addEventListener('click', event => {
    event.stopPropagation();
    player.toggleSound();
  });
  player.subscribe(() => {
    const state = player.soundState;
    const label = state === 'off' ? 'Room music is off — choose a track in Edit room' :
      state === 'paused' ? 'Mute room music (temporarily paused)' :
      state === 'playing' ? 'Mute room music' : 'Unmute room music';
    button.dataset.soundState = state;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.disabled = state === 'off';
  });
  return button;
}
