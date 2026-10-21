import type { ObjectKind } from '../core/types';

// The hand-picked starter set in the intro crate. Hardcoded: nobody can edit these until the tutorial ends.
// "Special" means the link and display text are locked; the visitor may still swap the object kind.
// Links open in a new tab from the preview card; the cassette's YouTube link also previews inline.

export interface IntroObject {
  id: string;
  kind: ObjectKind;
  title: string;
  url: string;
  note: string;
  /** Link and text can't be edited by the visitor. */
  locked: true;
  /** Only the cassette is playable, and it is the last one to be placed. */
  playable?: true;
}

export const INTRO_OBJECTS: readonly IntroObject[] = [
  { id: 'intro-rocket', kind: 'rocket', title: 'Unpacking', url: 'https://www.unpackinggame.com/', note: '', locked: true },
  { id: 'intro-drum', kind: 'drum', title: 'About Misc. Manor', url: 'https://misc-manor-demo.vercel.app/about', note: '', locked: true },
  { id: 'intro-cassette', kind: 'cassette', title: 'lofi hip hop radio', url: 'https://www.youtube.com/watch?v=rFZHOHl-L8A', note: '', locked: true, playable: true },
];

