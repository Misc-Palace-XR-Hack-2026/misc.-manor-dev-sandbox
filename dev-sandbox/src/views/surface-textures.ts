import * as THREE from 'three';
import type { SurfaceSelection, SurfaceTarget } from '../core/surfaces';
import { SURFACE_LOOKS } from '../core/surface-looks';
import { paintFinish } from './procedural-finishes';

/** Owned by the caller. All defaults are generated locally; no remote requests. */
export function surfaceTexture(target: SurfaceTarget, selection: SurfaceSelection, onError: () => void): THREE.Texture {
 let texture: THREE.Texture;
 if (selection.preset === 'custom') {
  const image = new Image();
  texture = new THREE.Texture(image);
  let disposed = false;
  texture.addEventListener('dispose', () => { disposed = true; image.onload = image.onerror = null; });
  image.onload = () => { if (!disposed) texture.needsUpdate = true; };
  image.onerror = () => { if (!disposed) onError(); };
  image.src = selection.imageData!;
 } else {
  const finish = Object.values(SURFACE_LOOKS).map(look=>look[target]).find(f=>f.id===selection.preset);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = finish ? 512 : 256;
  // New finishes read pixels for seeded grain; stay on one raster backend for reproducible output.
  const c = canvas.getContext('2d', finish ? {willReadFrequently:true} : undefined)!;
  const preset = selection.preset;
  const fill = (color: string, x=0, y=0, w=256, h=256) => { c.fillStyle=color; c.fillRect(x,y,w,h); };
  if (finish) paintFinish(c,finish,target==='background');
  else if (target === 'background') {
   const colors = preset === 'sky' ? ['#7aafd3','#e8f0ed'] : preset === 'gradient' ? ['#403d68','#d9a38b'] : ['#b7bbb6','#e0ded5'];
   const g=c.createLinearGradient(0,0,0,256);g.addColorStop(0,colors[0]);g.addColorStop(1,colors[1]);c.fillStyle=g;c.fillRect(0,0,256,256);
  } else if (preset === 'wood') {
   fill('#7d5233');
   for(let row=0;row<4;row++) {
    fill(['#b58959','#c49a69','#a87a4c','#bc905f'][row],0,row*64+2,256,60);
    for(let line=0;line<12;line++) {c.strokeStyle='rgba(83,48,25,.18)';c.beginPath();c.moveTo(0,row*64+line*5+3);c.bezierCurveTo(64,row*64+line*5,180,row*64+line*5+8,256,row*64+line*5+3);c.stroke();}
    fill('#7d5233',row%2 ? 170 : 70,row*64,2,64);
   }
  } else if (preset === 'brick') {
   fill('#d1bba6');
   for(let row=0;row<4;row++) for(let col=-1;col<3;col++) fill(['#af6e53','#bd7c5d','#a6614c'][(row+col+3)%3],col*128+(row%2)*64+3,row*64+3,122,58);
  } else if (preset === 'tile' || preset === 'stone') {
   fill(preset==='tile'?'#b7ac94':'#505858');
   for(let row=0;row<2;row++) for(let col=0;col<2;col++) fill(preset==='tile' ? ((row+col)%2?'#dfd6bc':'#eee5cf') : ((row+col)%2?'#81908c':'#6f7e7c'),col*128+2,row*128+2,124,124);
  } else fill('#dfd6bf');
  // Deterministic fine grain keeps plaster and stone tactile without external assets.
  if (preset==='plaster' || preset==='stone') for(let i=0;i<5000;i++) fill(i%2?'rgba(255,255,255,.08)':'rgba(0,0,0,.05)',(i*73)%256,(i*137+Math.floor(i/256)*31)%256,1,1);
  texture = new THREE.CanvasTexture(canvas);
 }
 texture.colorSpace = THREE.SRGBColorSpace;
 if(target !== 'background') texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
 return texture;
}

/** World-sized, continuous tiling across box faces (one tile per two units). */
export function surfaceGeometry(size: [number,number,number], min: [number,number,number]): THREE.BoxGeometry {
 const geometry = new THREE.BoxGeometry(...size);
 const pos=geometry.getAttribute('position'), normal=geometry.getAttribute('normal'), uv=geometry.getAttribute('uv');
 for(let i=0;i<pos.count;i++) {
  const x=pos.getX(i)+min[0]+size[0]/2, y=pos.getY(i)+min[1]+size[1]/2, z=pos.getZ(i)+min[2]+size[2]/2;
  if(Math.abs(normal.getY(i))>.5) uv.setXY(i,x/2,-z/2);
  else if(Math.abs(normal.getX(i))>.5) uv.setXY(i,z/2,y/2);
  else uv.setXY(i,x/2,y/2);
 }
 return geometry;
}
