// Demo-day switches. Flipping one of these back is a one-line change, so nothing has to be
// re-implemented after the demo.

/**
 * The toolbar's `Preview`, the editor's `Preview room`, and the content editor's `Preview room`
 * are all hidden while this is false. Desktop/mobile Preview mode itself still exists and still
 * works via `store.setMode('preview')`; only the buttons that walk into it are hidden, so the
 * demo cannot be derailed by landing in a read-only room. Set to true to restore the buttons.
 */
export const SHOW_PREVIEW_BUTTON = false;

/** Where `Watch the intro` goes. Absolute so it resolves from `/` and from `/dev/` alike. */
export const INTRO_PATH = '/intro/';
