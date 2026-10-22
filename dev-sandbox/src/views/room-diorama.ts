import type { RoomState } from '../core/types';
import { getLayout } from '../core/layout';
import { LIGHTING_PRESETS } from '../core/appearance';
/** Schematic isometric diorama from the actual room's slots, objects and lighting (not a screenshot). */
export function drawRoomDiorama(c:CanvasRenderingContext2D,room:RoomState,x:number,y:number,w:number,h:number):void {
 c.save();c.translate(x+w/2,y+h*.24);
 const scale=Math.min(w/20,h/13);
 const project=(x:number,z:number,height=0)=>[(x-z)*scale,(x+z)*scale*.42-height*scale];
 const poly=(points:number[][],color:string)=>{c.fillStyle=color;c.beginPath();points.forEach((p,i)=>{if(i)c.lineTo(p[0],p[1]);else c.moveTo(p[0],p[1]);});c.closePath();c.fill();};
 const accent=room.lighting?LIGHTING_PRESETS[room.lighting].color:'#b1a5ef';
 poly([project(0,0),project(10.3,0),project(10.3,7.3),project(0,7.3)],'#57515f');
 poly([project(0,0),project(10.3,0),project(10.3,0,2),project(0,0,2)],'#8d8298');
 poly([project(0,0),project(0,7.3),project(0,7.3,2),project(0,0,2)],'#72687f');
 const layout=getLayout(room.layoutId);
 for(const placement of room.placements){
  const slot=layout?.slots.find(s=>s.id===placement.slotId);if(!slot)continue;
  const [px,py]=project(slot.pos[0],slot.pos[2],slot.pos[1]);
  c.fillStyle=accent;c.fillRect(px-3,py-9,6,9);c.fillStyle='#eee8f5';c.fillRect(px-3,py-10,6,2);
 }
 c.restore();
}
