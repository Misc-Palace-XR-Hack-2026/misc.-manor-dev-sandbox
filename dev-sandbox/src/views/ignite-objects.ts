import * as THREE from 'three';
const cream=0xeee0c6, wood=0x81543c, dark=0x302c30, glass=0x77aaa5;
function block(name:string,w:number,h:number,d:number,color:number,x=0,y=h/2,z=0):THREE.Mesh {
 const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.75,transparent:color===glass,opacity:color===glass?.55:1}));
 m.name=name;m.position.set(x,y,z);return m;
}
function flame(animated:boolean, x=0, y=.055, z=-.03, scale=1):THREE.Object3D[] {
 const s=new THREE.Shape();s.moveTo(0,0);s.bezierCurveTo(-.26,.03,-.25,.22,-.12,.35);s.quadraticCurveTo(-.13,.23,-.05,.22);s.quadraticCurveTo(.12,.37,.04,.57);s.bezierCurveTo(.35,.34,.25,.05,0,0);
 const f=new THREE.Mesh(new THREE.ExtrudeGeometry(s,{depth:.065,bevelEnabled:false,curveSegments:10}),new THREE.MeshStandardMaterial({color:0xffad47,emissive:0xff690f,emissiveIntensity:1.8,roughness:.6}));
 f.name='flame';f.position.set(x,y,z);f.scale.set(scale,scale,1);
 const inner=f.clone();inner.geometry=f.geometry.clone();inner.material=new THREE.MeshStandardMaterial({color:0xffed9b,emissive:0xffc34f,emissiveIntensity:2.2});inner.name='flame-heart';inner.scale.set(.48*scale,.55*scale,1.1);inner.position.z=z+.075;
 if(animated) f.userData.animate=(t:number)=>{f.scale.y=scale*(.94+.06*Math.sin(t*4)+.025*Math.sin(t*7));inner.scale.y=.55*scale*(.96+.08*Math.sin(t*5));};
 const halo=new THREE.Mesh(new THREE.SphereGeometry(.22*scale,16,8),new THREE.MeshBasicMaterial({color:0xff951e,transparent:true,opacity:.12,blending:THREE.AdditiveBlending,depthWrite:false}));
 halo.name='fire-glow';halo.position.set(x,y+.18*scale,z);halo.scale.set(1,1,.6);
 const light=new THREE.PointLight(0xffa14a,.65,2,2);light.name='fire-light';light.position.set(x,y+.22*scale,z+.08);
 return [f,inner,halo,light];
}
export const igniteBuilders={
 arDevice:():THREE.Object3D[]=>{
  const standH=.04, frameH=.14, frameD=.05, sink=.012, frameY=standH-sink+frameH/2, frameZ=.03;
  return [
   block('ar-stand',.50,.04,.24,cream),
   block('ar-bridge',.12,.03,.04,wood,0,frameY,.03),
   ...[-1,1].flatMap((side)=>{
    const n=side<0?'left':'right';
    const x=side*.145;
    return [
     block('ar-frame-'+n,.22,.14,.05,wood,x,frameY,frameZ),
     block('ar-lens-'+n,.16,.10,.012,glass,x,frameY,frameZ+frameD/2),
     block('ar-lens-'+n+'-back',.16,.10,.012,glass,x,frameY,frameZ-frameD/2),
     block('ar-temple-'+n,.03,.03,.26,wood,side*.22,frameY+.01,frameZ-.12),
    ];
   }),
  ];
 },
 vrDevice:():THREE.Object3D[]=>{
  const visorH=.26, visorD=.20, visorY=visorH/2, visorZ=.08;
  const strapR=.18;
  const strap=new THREE.Mesh(new THREE.TorusGeometry(strapR,.032,8,24,Math.PI),new THREE.MeshStandardMaterial({color:wood,roughness:.75}));
  strap.name='vr-strap';
  strap.rotation.x=-Math.PI/2;
  strap.position.set(0,visorY,visorZ-visorD/2);
  return [
   block('vr-visor',.56,visorH,visorD,cream,0,visorY,visorZ),
   block('vr-face',.48,.18,.018,dark,0,visorY,visorZ+visorD/2),
   strap,
   ...[-1,1].map(side=>block('vr-lens-'+(side<0?'left':'right'),.16,.12,.016,glass,side*.13,visorY,visorZ+visorD/2)),
  ];
 },
 igniteLogo:():THREE.Object3D[]=>[block('ignite-plinth',.48,.055,.25,wood),...flame(false)],
 fireplace:():THREE.Object3D[]=>{
  const hearthH=.06, jambH=.52, mantelH=.08, overlap=.012;
  const jambY=hearthH-overlap+jambH/2;
  const mantelY=hearthH-overlap+jambH-overlap+mantelH/2;
  return [
   block('hearth',.84,hearthH,.36,wood,0,hearthH/2,.02),
   block('fireback',.58,jambH,.06,dark,0,jambY,-.09),
   block('mantel',.80,mantelH,.30,cream,0,mantelY,.02),
   ...[-1,1].map(side=>block('jamb-'+(side<0?'left':'right'),.10,jambH,.24,cream,side*.32,jambY,.02)),
   block('log',.36,.07,.12,wood,0,hearthH+.035,.08),
   ...flame(true,0,hearthH+.07,.08,.55),
  ];
 }
};
/** No timers or shared materials: removing a model stops its animation immediately. */
export function animateIgnite(root:THREE.Object3D,t:number,reducedMotion=false):void {
 let lights=0;
 root.traverse(o=>{
  if(o.name==='fire-light' && o instanceof THREE.PointLight) o.intensity=lights++<4?.65:0;
  if(typeof o.userData.animate==='function') o.userData.animate(reducedMotion?0:t);
 });
}
