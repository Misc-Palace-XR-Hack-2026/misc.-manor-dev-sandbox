import type { CatalogRoom } from './room-portal';
import type { RoomState, ObjectKind } from './types';
export const NEIGHBORHOOD_THEMES = {
 daylight: { label: 'Daylight Court', center: [-28,-25], color: 0x9ab5bd, ground: 0x9fae8c, light: 0xc6e5ff },
 warm: { label: 'Fireside Court', center: [28,-25], color: 0xbc805d, ground: 0xb9a17a, light: 0xffab68 },
 garden: { label: 'Conservatory Court', center: [-28,25], color: 0x74977a, ground: 0x7f9e75, light: 0x77ffb7 },
 electric: { label: 'Twilight Court', center: [28,25], color: 0x8d79ad, ground: 0x9b91ad, light: 0xc69aff },
} as const;
export type NeighborhoodTheme = keyof typeof NEIGHBORHOOD_THEMES;
export const NEIGHBORHOOD_CENTERPIECES: Record<NeighborhoodTheme, ObjectKind> = { daylight: 'globe', warm: 'fireplace', garden: 'plant', electric: 'telescope' };
/** Explicit saved lighting wins; surface metadata is a deterministic fallback, never owner/name guessing. */
export function neighborhoodTheme(room: RoomState): NeighborhoodTheme {
 if (room.lighting) {
  if (['cyber','twilight','vaporwave'].includes(room.lighting)) return 'electric';
  if (room.lighting==='emerald') return 'garden';
  if (['dawn','sunset','candlelight','ember'].includes(room.lighting)) return 'warm';
  return 'daylight';
 }
 const presets=Object.values(room.surfaces??{}).map(s=>s.preset).join(' ');
 if (/forest|moss|garden|leaf|fern/i.test(presets)) return 'garden';
 if (/neon|violet|lavender|cosmic|dusk/i.test(presets)) return 'electric';
 if (/wood|brick|terracotta|amber/i.test(presets)) return 'warm';
 return 'daylight';
}
export const NEIGHBORHOOD_COURT_CAPACITY = 6;
export const NEIGHBORHOOD_COURT_RADIUS = 16;
export interface NeighborhoodAddress { id:string;theme:NeighborhoodTheme;branch:number;court:[number,number];connection:[number,number];position:[number,number];spawn:[number,number];rotation:number }
export function neighborhoodPlan(catalog: CatalogRoom[], personal: RoomState): NeighborhoodAddress[] {
 const plan: NeighborhoodAddress[]=[];
 for (const theme of Object.keys(NEIGHBORHOOD_THEMES) as NeighborhoodTheme[]) {
  const rooms=catalog.filter(r=>neighborhoodTheme(r.data??personal)===theme).sort((a,b)=>a.id.localeCompare(b.id));
  const base=NEIGHBORHOOD_THEMES[theme].center;
  rooms.forEach((room,index)=>{
   const branch=Math.floor(index/NEIGHBORHOOD_COURT_CAPACITY), slot=index%NEIGHBORHOOD_COURT_CAPACITY;
   const count=Math.min(NEIGHBORHOOD_COURT_CAPACITY,rooms.length-branch*NEIGHBORHOOD_COURT_CAPACITY);
   const court:[number,number]=[base[0]+Math.sign(base[0])*branch*52,base[1]];
   // Fixed-size 270° rings leave +Z open. Parallel trunks connect every branch to the main promenade.
   const angle=count===1?Math.PI*1.5:Math.PI*.75+slot/(count-1)*Math.PI*1.5;
   const x=court[0]+Math.cos(angle)*NEIGHBORHOOD_COURT_RADIUS,z=court[1]+Math.sin(angle)*NEIGHBORHOOD_COURT_RADIUS;
   const rotation=Math.atan2(court[0]-x,court[1]-z);
   plan.push({id:room.id,theme,branch,court,connection:[court[0],court[1]+24],position:[x,z],spawn:[x+Math.sin(rotation)*5.5,z+Math.cos(rotation)*5.5],rotation});
  });
 }
 return plan;
}
