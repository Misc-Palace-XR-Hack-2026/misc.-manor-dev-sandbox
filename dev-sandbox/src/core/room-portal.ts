import { Store, normalizeRoom } from './store';
import { ROOM_DIRECTORY, seedRoom } from './rooms';
import type { RoomState } from './types';
export interface CatalogRoom { id: string; label: string; data?: RoomState }

/**
 * Which rooms/<name>.json each named room actually seeds from, mirroring `seedSource()`:
 * a file matching the room id wins over the slot's `seed`. Those files are the named room's own
 * content, so listing them again as unnamed repo rooms would show the same room twice.
 */
export function seededRepoNames(repo: Record<string, unknown>): Set<string> {
  const used = new Set<string>();
  for (const slot of ROOM_DIRECTORY) {
    if (slot.seed === undefined) continue;
    used.add(slot.id in repo ? slot.id : slot.seed);
  }
  return used;
}

export function roomCatalog(rooms: {name:string;data:unknown}[]): CatalogRoom[] {
 const repo=Object.fromEntries(rooms.map(r=>[r.name,r.data]));
 const named=seededRepoNames(repo);
 return [ {id:'home',label:'My room'},
  ...ROOM_DIRECTORY.filter(r=>r.id!=='guest').map(r=>({id:'directory:'+r.id,label:r.defaultName,data:seedRoom(r.id,repo)})),
  // Only the repo rooms no named room already represents.
  ...rooms.filter(r=>!named.has(r.name)).map(r=>({id:'repo:'+r.name,label:r.name.replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase()),data:normalizeRoom(r.data)})),
 ];
}
export function visitCatalogRoom(store:Store, room:CatalogRoom):void {
 if(room.id==='home') store.returnHome();
 else if(room.data) store.visit(room.data,room.id);
}
export function randomRoom(catalog:CatalogRoom[],current:string|null,rng= Math.random):CatalogRoom|undefined {
 const choices=catalog.filter(r=>r.id!=='home'&&r.id!==current);
 return choices[Math.min(choices.length-1,Math.max(0,Math.floor(rng()*choices.length)))];
}
export function loadRoomJson(store:Store,text:string):void { store.replaceState(JSON.parse(text)); }
export function downloadRoom(store:Store):void {
 const url=URL.createObjectURL(new Blob([store.exportJson()],{type:'application/json'}));
 const a=document.createElement('a'); a.href=url; a.download='misc-manor-room.json';
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
