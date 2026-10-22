// Engine-free data model. Nothing in src/core may import three or touch the DOM scene.
// Adapted from xrMindPalace-poc-matt/docs/data-model.md

export const SCHEMA_VERSION = 1;

export const CONTENT_TYPES = ['link', 'article', 'image', 'video', 'music', 'doc', 'file', 'note', 'tool'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const OBJECT_KINDS = [
  'arDevice', 'vrDevice', 'igniteLogo', 'fireplace',
  'book', 'photoFrame', 'record', 'tv', 'boombox', 'box', 'plant', 'mug', 'notebook', 'trophy',
  'armchair', 'sideTable', 'turntable', 'rug',
  'clock', 'guitar', 'synthesizer', 'drum', 'lamp', 'coffeeMaker',
  'cat', 'teapot', 'lantern', 'headphones', 'cassette', 'cushion',
  'console', 'cartridge', 'vhs', 'recordSleeve', 'spoon', 'robot', 'telescope', 'car', 'motorcycle',
  'fishBowl', 'yoyo', 'skateboard', 'soccerBall', 'flyingSaucer', 'lavaLamp', 'rubiksCube', 'rubberDuck',
  'globe', 'cactus', 'dice', 'rocket',
] as const;
export type ObjectKind = (typeof OBJECT_KINDS)[number];

export const OBJECT_LABELS: Record<ObjectKind, string> = {
  arDevice: 'Ignite AR glasses', vrDevice: 'Ignite VR headset', igniteLogo: 'Ignite flame', fireplace: 'Cozy fireplace',
  book: 'Book', photoFrame: 'Photo frame', record: 'Record player (classic)', tv: 'TV',
  boombox: 'Boombox', box: 'Storage box', plant: 'Leafy plant', mug: 'Mug',
  notebook: 'Notebook', trophy: 'Trophy', armchair: 'Armchair',
  sideTable: 'Side table', turntable: 'Turntable cabinet', rug: 'Patterned rug',
  cat: 'Sleeping cat', teapot: 'Teapot', lantern: 'Paper lantern',
  headphones: 'Headphones', cassette: 'Cassette tape', cushion: 'Floor cushion',
  console: 'Retro console', cartridge: 'Game cartridge', vhs: 'VHS tape',
  recordSleeve: 'Vinyl jacket', spoon: 'Spoon', robot: 'Robot',
  telescope: 'Telescope', car: 'Car', motorcycle: 'Motorcycle',
  clock: 'Mantel clock', guitar: 'Acoustic guitar', synthesizer: 'Synthesizer',
  drum: 'Drum', lamp: 'Table lamp', coffeeMaker: 'Coffee maker',
  fishBowl: 'Fish bowl', yoyo: 'Yo-yo', skateboard: 'Skateboard', soccerBall: 'Soccer ball',
  flyingSaucer: 'Flying saucer', lavaLamp: 'Lava lamp', rubiksCube: 'Puzzle cube', rubberDuck: 'Rubber duck',
  globe: 'Globe', cactus: 'Cactus', dice: 'Dice', rocket: 'Toy rocket',
};

/** Which object represents which media by default. Devs can change any object freely. */
export const DEFAULT_OBJECT: Record<ContentType, ObjectKind> = {
  link: 'book',
  article: 'notebook',
  image: 'photoFrame',
  video: 'tv',
  music: 'turntable',
  doc: 'book',
  file: 'box',
  note: 'notebook',
  tool: 'mug',
};

/** The media itself. Never changes when an object is moved or swapped. */
export interface ContentItem {
  /** Last representation kind when stashed; absent in legacy saves and never-represented inbox items. */
  lastObjectKind?: ObjectKind;
  imageData?: string;
  /** Optional researched context; the outbound URL stays in sourceRef. */
  notes?: string;
  id: string;
  type: ContentType;
  title: string;
  sourceKind: 'url' | 'file' | 'note';
  sourceRef: string;
  tags: string[];
  createdAt: string;
  /** Link and text are fixed (the demo's starter objects). The object kind can still change and it can be stashed. */
  locked?: boolean;
  /** The room (ROOM_DIRECTORY id) it was copied from, e.g. by the demo's Random drop. Shown as "from <owner>". */
  fromRoom?: string;
}

/** The visible object standing in for a content item. */
export interface Representation {
  id: string;
  contentItemId: string;
  objectKind: ObjectKind;
}

/** Where a representation sits. No placement = held / unplaced. */
export interface Placement {
  representationId: string;
  slotId: string;
}

/** One saved room = one dev's file in rooms/. */
export interface RoomState {
  soundtrack?: import("./soundtrack").Soundtrack;
  surfaces?: import("./surfaces").SurfaceSettings;
  lighting?: import("./appearance").Lighting;
  schemaVersion: number;
  /**
   * Which committed rooms/*.json revision this room was seeded from (see core/seed-revision.ts).
   * Optional and ignored by older builds: the schema version stays 1 in both directions.
   */
  seedRevision?: string;
  id: string;
  owner: string;
  layoutId: string;
  contentItems: ContentItem[];
  representations: Representation[];
  placements: Placement[];
}
