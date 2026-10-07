// Engine-free data model. Nothing in src/core may import three or touch the DOM scene.
// Adapted from xrMindPalace-poc-matt/docs/data-model.md

export const SCHEMA_VERSION = 1;

export const CONTENT_TYPES = ['link', 'article', 'image', 'video', 'music', 'doc', 'file', 'note', 'tool'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const OBJECT_KINDS = [
  'book', 'photoFrame', 'record', 'tv', 'boombox', 'box', 'plant', 'mug', 'notebook', 'trophy',
] as const;
export type ObjectKind = (typeof OBJECT_KINDS)[number];

/** Which object represents which media by default. Devs can change any object freely. */
export const DEFAULT_OBJECT: Record<ContentType, ObjectKind> = {
  link: 'book',
  article: 'notebook',
  image: 'photoFrame',
  video: 'tv',
  music: 'record',
  doc: 'book',
  file: 'box',
  note: 'notebook',
  tool: 'mug',
};

/** The media itself. Never changes when an object is moved or swapped. */
export interface ContentItem {
  id: string;
  type: ContentType;
  title: string;
  sourceKind: 'url' | 'file' | 'note';
  sourceRef: string;
  tags: string[];
  createdAt: string;
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
  schemaVersion: number;
  id: string;
  owner: string;
  layoutId: string;
  contentItems: ContentItem[];
  representations: Representation[];
  placements: Placement[];
}
