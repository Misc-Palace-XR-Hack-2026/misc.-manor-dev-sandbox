import { buildSavePoint, type SavePoint } from './save-point';
import { SAVE_POINT_POS, ROOM_EAST } from '../core/intro-timeline';

// Front is +Z (open edge at z=7.3). Mirror the item portal across the room's X midpoint.
export const ROOM_PORTAL_POS = [ROOM_EAST - SAVE_POINT_POS[0], SAVE_POINT_POS[1], SAVE_POINT_POS[2]] as const;

/** The same unlabeled production pillar, distinguished only by a restrained lavender tint. */
export function buildRoomPortal(): SavePoint {
  const portal = buildSavePoint(0xb1a5ef, 0xe4dfff);
  portal.group.name = 'rooms-portal';
  portal.group.position.set(...ROOM_PORTAL_POS);
  return portal;
}
