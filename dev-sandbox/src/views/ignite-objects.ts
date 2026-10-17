import * as THREE from 'three';
const cream=0xeee0c6, wood=0x81543c, dark=0x302c30;
function block(name:string,w:number,h:number,d:number,color:number,x=0,y=h/2,z=0):THREE.Mesh {
 const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.75}));
 m.name=name;m.position.set(x,y,z);return m;
}
function flame(animated:boolean):THREE.Object3D[] {
 const s=new THREE.Shape();s.moveTo(0,0);s.bezierCurveTo(-.26,.03,-.25,.22,-.12,.35);s.quadraticCurveTo(-.13,.23,-.05,.22);s.quadraticCurveTo(.12,.37,.04,.57);s.bezierCurveTo(.35,.34,.25,.05,0,0);
 const f=new THREE.Mesh(new THREE.ExtrudeGeometry(s,{depth:.065,bevelEnabled:false,curveSegments:10}),new THREE.MeshStandardMaterial({color:0xffad47,emissive:0xff690f,emissiveIntensity:1.8,roughness:.6}));
 f.name='flame';f.position.set(0,.055,-.03);
 const inner=f.clone();inner.geometry=f.geometry.clone();inner.material=new THREE.MeshStandardMaterial({color:0xffed9b,emissive:0xffc34f,emissiveIntensity:2.2});inner.name='flame-heart';inner.scale.set(.48,.55,1.1);inner.position.z=.045;
 if(animated) f.userData.animate=(t:number)=>{f.scale.y=.94+.06*Math.sin(t*4)+.025*Math.sin(t*7);inner.scale.y=.53+.04*Math.sin(t*5);};
 // Additive halo gives visible glow even when the room's light budget is exhausted.
 const halo=new THREE.Mesh(new THREE.SphereGeometry(.29,16,8),new THREE.MeshBasicMaterial({color:0xff951e,transparent:true,opacity:.12,blending:THREE.AdditiveBlending,depthWrite:false}));
 halo.name='fire-glow';halo.position.y=.29;halo.scale.set(1,1,.6);
 const light=new THREE.PointLight(0xffa14a,.65,2,2);light.name='fire-light';light.position.set(0,.35,.18);
 return [f,inner,halo,light];
}
export const igniteBuilders={
 arDevice:():THREE.Object3D[]=>[
  block('ar-bridge',.12,.04,.045,wood,0,.16,.12),
  ...[-1,1].flatMap((side)=>{const n=side<0?'left':'right';return [block('ar-frame-'+n,.25,.18,.06,wood,side*.16,.16,.12),block('ar-lens-'+n,.20,.125,.012,0x77aaa5,side*.16,.16,.156),block('ar-temple-'+n,.035,.04,.36,wood,side*.29,.20,-.035)];}),
  block('ar-stand',.38,.04,.20,cream),block('ar-support',.035,.10,.035,wood,0,.07,0)
 ],
 vrDevice:():THREE.Object3D[]=>{
  const strap=new THREE.Mesh(new THREE.TorusGeometry(.23,.035,6,24),new THREE.MeshStandardMaterial({color:wood}));strap.name='vr-strap';strap.rotation.x=Math.PI/2;strap.position.set(0,.17,-.10);
  return [block('vr-visor',.56,.28,.22,cream,0,.14,.10),block('vr-face',.48,.20,.018,dark,0,.15,.219),strap,
   ...[-1,1].map(side=>block('vr-lens-'+(side<0?'left':'right'),.16,.13,.015,0x749c9d,side*.13,.15,-.018)),block('vr-top-strap',.055,.035,.32,wood,0,.28,-.035)];
 },
 igniteLogo:():THREE.Object3D[]=>[block('ignite-plinth',.48,.055,.25,wood),...flame(false)],
 fireplace:():THREE.Object3D[]=>[
   block('hearth',.70,.05,.32,wood,0,.025,.06),
   block('fireback',.42,.40,.04,dark,0,.34,-.08),
   block('mantel',.78,.07,.28,cream,0,.78,0),
   ...[-1,1].map(side=>block('jamb',.08,.46,.18,cream,side*.34,.38,.06)),
   block('log',.36,.06,.12,wood,0,.10,.10),...flame(true)
 ]
};
/** No timers or shared materials: removing a model stops its animation immediately. */
export function animateIgnite(root:THREE.Object3D,t:number,reducedMotion=false):void {
 let lights=0;
 root.traverse(o=>{
  if(o.name==='fire-light' && o instanceof THREE.PointLight) o.intensity=lights++<4?.65:0;
  if(typeof o.userData.animate==='function') o.userData.animate(reducedMotion?0:t);
 });
}
