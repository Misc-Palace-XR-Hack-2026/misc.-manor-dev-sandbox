// When the public demo should play the walk-in, kept out of demo-app.ts so it can be tested on its own.
//
// Two rules the old code got wrong:
//   * an explicit request (?intro, or /intro/ which forwards to /?intro) ALWAYS plays the walk-in, even
//     when the visitor's saved room has the tutorial finished;
//   * the re-seed and the start condition are decided together, so they can never disagree.

export interface IntroPlan {
  /** Play the walk-in from the top. */
  playIntro: boolean;
  /** Put the starter objects back in their box first (only needed for a finished room). */
  reseed: boolean;
}

export function planIntro(opts: { explicit: boolean; introAllowed: boolean; tutorialDone: boolean }): IntroPlan {
  // Explicit replay should always start from the canonical intro state: all starter objects back in the tray.
  if (opts.explicit) return { playIntro: true, reseed: true };
  if (opts.introAllowed && !opts.tutorialDone) return { playIntro: true, reseed: false };
  // A visitor who has seen the intro and kept their finished room walks straight into it.
  return { playIntro: false, reseed: false };
}
