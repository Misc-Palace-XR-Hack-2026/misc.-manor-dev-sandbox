import * as THREE from 'three';
import { glowIndicator } from './glow';

// Base-centered, +Z forward, slot-sized models. Detail offsets avoid coplanar skins.
const wood = 0x995d38, brass = 0xc6a264, cream = 0xf4e4c3, dark = 0x292b30;
export const LAMP_LIGHT = { intensity: 0.85, distance: 2.8, maxCount: 6, color: 0xffbe6b } as const;
export function lampLightBudget(count: number): number {
  return Math.min(Math.max(0, count), LAMP_LIGHT.maxCount);
}

export function applyLampLightBudget(root: THREE.Object3D): void {
  const lights: THREE.PointLight[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.PointLight && o.name === 'lamp-light') lights.push(o);
  });
  const keep = lampLightBudget(lights.length);
  lights.forEach((light, i) => {
    // Lights may be moodier than a reading lamp (a lava lamp); the budget decides *whether* a light
    // burns, never how bright its own source is. `lit` is what per-frame pulses must respect.
    const base = typeof light.userData.baseIntensity === 'number' ? light.userData.baseIntensity : LAMP_LIGHT.intensity;
    const lit = i < keep;
    light.userData.lit = lit;
    light.intensity = lit ? base : 0;
  });
}
const material = (color: number) => new THREE.MeshStandardMaterial({color,roughness:.72});
function part(name:string, geometry:THREE.BufferGeometry, color:number, x:number,y:number,z:number): THREE.Mesh {
  const m = new THREE.Mesh(geometry,material(color));m.name=name;m.position.set(x,y,z);return m;
}
const block = (name:string,w:number,h:number,d:number,color:number,x=0,y=h/2,z=0) => part(name,new THREE.BoxGeometry(w,h,d),color,x,y,z);
const cylinder = (name:string,rt:number,rb:number,h:number,color:number,x=0,y=h/2,z=0) => part(name,new THREE.CylinderGeometry(rt,rb,h,24),color,x,y,z);
function disc(name:string,r:number,h:number,color:number,x:number,y:number,z:number): THREE.Mesh {
  const m=cylinder(name,r,r,h,color,x,y,z);m.rotation.x=Math.PI/2;return m;
}

export const cozyBuilders = {
  clock: (): THREE.Object3D[] => {
    const p:THREE.Object3D[]=[block('clock-plinth',.44,.05,.20,wood),disc('clock-case',.21,.12,wood,0,.25,0),disc('clock-face',.185,.014,cream,0,.25,.064)];
    for(let i=0;i<12;i++) {
      const a=i*Math.PI/6;
      const tick=block(`clock-tick-${i}`,.012,.025,.006,brass,Math.sin(a)*.153,.25+Math.cos(a)*.153,.074);
      tick.rotation.z=-a;p.push(tick);
    }
    const hour=block('clock-hour',.015,.105,.008,dark,-.024,.287,.082);hour.rotation.z=.58;
    const minute=block('clock-minute',.009,.14,.008,dark,.043,.296,.092);minute.rotation.z=-.75;
    p.push(hour,minute,disc('clock-pin',.017,.023,brass,0,.25,.089));return p;
  },
  guitar: (): THREE.Object3D[] => {
    const shape=new THREE.Shape();shape.moveTo(0,.035);
    shape.bezierCurveTo(-.26,.035,-.24,.25,-.13,.29);
    shape.bezierCurveTo(-.075,.32,-.20,.42,-.095,.47);
    shape.bezierCurveTo(-.045,.495,.045,.495,.095,.47);
    shape.bezierCurveTo(.20,.42,.075,.32,.13,.29);
    shape.bezierCurveTo(.24,.25,.26,.035,0,.035);
    const hole=new THREE.Path();hole.absellipse(0,.355,.054,.054,0,Math.PI*2,true);shape.holes.push(hole);
    const body=part('guitar-body',new THREE.ExtrudeGeometry(shape,{depth:.10,bevelEnabled:false,curveSegments:16}),0xc88e4f,0,0,-.05);
    const p:THREE.Object3D[]=[block('guitar-stand',.26,.035,.23,dark),body,block('guitar-neck',.057,.37,.047,wood,0,.60,0),block('guitar-fretboard',.049,.35,.012,dark,0,.605,.029),block('guitar-headstock',.083,.13,.05,wood,0,.82,0),block('guitar-bridge',.13,.027,.021,dark,0,.16,.055),block('guitar-nut',.055,.017,.038,cream,0,.752,.049),disc('guitar-soundhole-back',.075,.005,0x38251d,0,.355,.033)];
    for(let i=0;i<6;i++) {
      p.push(block(`guitar-string-${i}`,.0016,.595,.0016,cream,(i-2.5)*.006,.4575,.064));
      p.push(cylinder(`guitar-tuner-${i}`,.012,.012,.018,brass,i%2 ? .05 : -.05,.79+Math.floor(i/2)*.032));
    }
    for(let i=0;i<9;i++) p.push(block(`guitar-fret-${i}`,.05,.003,.004,brass,0,.46+i*.034,.038));
    return p;
  },
  synthesizer: (): THREE.Object3D[] => {
    const p:THREE.Object3D[]=[block('synth-case',.72,.105,.35,dark,0,.0575),block('synth-cheek-left',.035,.13,.36,wood,-.3775,.065),block('synth-cheek-right',.035,.13,.36,wood,.3775,.065)];
    for(let i=0;i<14;i++) p.push(block(`synth-white-key-${i}`,.043,.023,.16,cream,-.304+i*.047,.119,.081));
    for(let i=0;i<13;i++) if(![2,6,9].includes(i)) p.push(block(`synth-black-key-${i}`,.022,.022,.092,dark,-.2805+i*.047,.140,.045));
    // Backlit LCD: a calm breath, the one lit part of the panel.
    p.push(glowIndicator(block('synth-display',.14,.008,.065,0x72a6a0,-.23,.114,-.09),{color:0x7fe6d8,base:.3,amp:.35,speed:.18,wave:'sine'}));
    for(let i=0;i<7;i++) p.push(cylinder(`synth-knob-${i}`,.016,.016,.027,i===6?0xc56548:brass,-.07+i*.056,.122,-.09));
    return p;
  },
  drum: (): THREE.Object3D[] => {
    const p:THREE.Object3D[]=[cylinder('drum-shell',.19,.19,.26,0x9c4938,0,.15),cylinder('drum-bottom-rim',.201,.201,.035,brass,0,.0175),cylinder('drum-top-rim',.201,.201,.027,brass,0,.287),cylinder('drum-head',.183,.183,.01,cream,0,.304)];
    for(let i=0;i<8;i++) {
      const a=i*Math.PI/4;p.push(cylinder(`drum-tension-${i}`,.008,.008,.25,brass,.192*Math.sin(a),.15,.192*Math.cos(a)));
    }
    return p;
  },
  lamp: (): THREE.Object3D[] => {
    const shade=cylinder('lamp-linen-shade',.11,.21,.23,cream,0,.465);
    (shade.material as THREE.MeshStandardMaterial).emissive.setHex(0xffbe6b);
    (shade.material as THREE.MeshStandardMaterial).emissiveIntensity=.22;
    const light=new THREE.PointLight(LAMP_LIGHT.color, LAMP_LIGHT.intensity, LAMP_LIGHT.distance, 2);
    light.name='lamp-light';
    light.position.set(0,.46,0);
    light.castShadow=false;
    return [cylinder('lamp-base',.15,.16,.04,wood),cylinder('lamp-foot',.09,.11,.03,brass,0,.045),cylinder('lamp-stem',.015,.02,.39,brass,0,.25),shade,cylinder('lamp-finial',.02,.02,.025,brass,0,.588),light];
  },
  coffeeMaker: (): THREE.Object3D[] => {
    const p:THREE.Object3D[]=[block('coffee-base',.37,.04,.32,dark),block('coffee-reservoir',.32,.46,.12,0x47756c,0,.27,-.095),block('coffee-brew-head',.33,.10,.30,0x47756c,0,.46,-.01),cylinder('coffee-hotplate',.117,.117,.014,brass,0,.047,.045),cylinder('coffee-carafe',.102,.11,.20,0x73503b,0,.151,.045),cylinder('coffee-carafe-lid',.115,.115,.023,dark,0,.262,.045),cylinder('coffee-spout',.024,.018,.06,brass,0,.390,.045),glowIndicator(block('coffee-switch',.035,.025,.016,0xd18757,.105,.46,.140),{color:0xff7a3c,base:.35,amp:.95,speed:.4,wave:'blink'})];
    const handle=part('coffee-handle',new THREE.TorusGeometry(.07,.014,8,16,Math.PI),dark,.108,.15,.045);handle.rotation.z=-Math.PI/2;p.push(handle);
    return p;
  },
};
