import type { Lighting } from './appearance';

export type FinishPattern = 'limestone' | 'woodgrain' | 'terrazzo' | 'slate' | 'circuit' | 'marble' | 'plaster' | 'linen' | 'brickwork' | 'fluted' | 'clouds' | 'sunset' | 'stars' | 'aurora' | 'haze';
export interface Finish {
 id: string;
 label: string;
 pattern: FinishPattern;
 /** Base, secondary, detail: shared by the local procedural renderer. */
 colors: readonly [string, string, string];
}
interface SurfaceLook { label: string; floor: Finish; wall: Finish; background: Finish }

/** Suggestions, not lighting side effects. Each finish remains independently selectable. */
export const SURFACE_LOOKS = {
 daylight: {
  label: 'Daylight gallery',
  floor: {id:'gallery-limestone',label:'Gallery limestone',pattern:'limestone',colors:['#d6cdb6','#ebe5d4','#aaa18e']},
  wall: {id:'chalk-limewash',label:'Chalk limewash',pattern:'plaster',colors:['#e7e3d7','#f3efe5','#c7c9bd']},
  background: {id:'cumulus-sky',label:'Daylight cumulus',pattern:'clouds',colors:['#73aad1','#e2eff1','#ffffff']},
 },
 dawn: {
  label: 'Golden-hour retreat',
  floor: {id:'honey-oak',label:'Honey oak',pattern:'woodgrain',colors:['#bb9162','#d5b17b','#795432']},
  wall: {id:'oat-linen',label:'Oat linen',pattern:'linen',colors:['#e2d2b5','#f3e5cc','#b49f80']},
  background: {id:'peach-morning',label:'Peach morning clouds',pattern:'clouds',colors:['#b5b9d2','#f7cd9e','#fff0d5']},
 },
 sunset: {
  label: 'Terracotta dusk',
  floor: {id:'terracotta-terrazzo',label:'Terracotta terrazzo',pattern:'terrazzo',colors:['#b77e63','#e1b497','#754e48']},
  wall: {id:'rose-stucco',label:'Rose stucco',pattern:'plaster',colors:['#d5afa0','#edd0b8','#b7847a']},
  background: {id:'amber-horizon',label:'Amber horizon',pattern:'sunset',colors:['#62628d','#efae7f','#ffe0ac']},
 },
 candlelight: {
  label: 'Fireside library',
  floor: {id:'smoked-walnut',label:'Smoked walnut',pattern:'woodgrain',colors:['#77563e','#9f7953','#49382c']},
  wall: {id:'hearth-brick',label:'Hearth brick',pattern:'brickwork',colors:['#9c7660','#b18b71','#d0b79b']},
  background: {id:'fireside-night',label:'Fireside starlight',pattern:'stars',colors:['#242a40','#786258','#f1d6b1']},
 },
 overcast: {
  label: 'Rainy-day atelier',
  floor: {id:'silver-slate',label:'Silver slate',pattern:'slate',colors:['#8a969c','#b0babd','#647178']},
  wall: {id:'mist-plaster',label:'Mist plaster',pattern:'plaster',colors:['#cdd4d4','#e1e5e2','#adbabe']},
  background: {id:'rain-clouds',label:'Layered rain clouds',pattern:'clouds',colors:['#879aaf','#d5dfe2','#e6e9e5']},
 },
 cyber: {
  label: 'Neon observatory',
  floor: {id:'graphite-circuit',label:'Graphite circuitry',pattern:'circuit',colors:['#263642','#40515d','#58cdd2']},
  wall: {id:'neon-ribbed',label:'Neon ribbed panels',pattern:'fluted',colors:['#46515f','#707c8c','#c882bd']},
  background: {id:'ion-aurora',label:'Ion aurora',pattern:'aurora',colors:['#121d3c','#524065','#4ad9d5']},
 },
 twilight: {
  label: 'Indigo reading room',
  floor: {id:'indigo-marble',label:'Indigo marble',pattern:'marble',colors:['#60657c','#9096af','#c6c9dc']},
  wall: {id:'violet-linen',label:'Violet linen',pattern:'linen',colors:['#a5a0b8','#c4bdd1','#7d7895']},
  background: {id:'indigo-stars',label:'Indigo starfield',pattern:'stars',colors:['#22213e','#6f658f','#e2dafa']},
 },
 emerald: {
  label: 'Fern conservatory',
  floor: {id:'moss-slate',label:'Moss slate',pattern:'slate',colors:['#748578','#a3af91','#485f54']},
  wall: {id:'sage-limewash',label:'Sage limewash',pattern:'plaster',colors:['#b7c6ad','#d8dfc8','#889f87']},
  background: {id:'forest-mist',label:'Forest mist ridges',pattern:'haze',colors:['#527b7b','#c4d9b8','#305c52']},
 },
 ember: {
  label: 'Ember salon',
  floor: {id:'basalt-veins',label:'Veined basalt',pattern:'marble',colors:['#554b4e','#7b6664','#c29b83']},
  wall: {id:'copper-fluted',label:'Copper fluted panels',pattern:'fluted',colors:['#97756b','#be9b83','#664f4d']},
  background: {id:'ember-haze',label:'Ember horizon haze',pattern:'haze',colors:['#352d42','#bd7867','#623e4c']},
 },
 vaporwave: {
  label: 'Pastel dreamscape',
  floor: {id:'pearl-terrazzo',label:'Pearl terrazzo',pattern:'terrazzo',colors:['#d5c4d6','#f4e5d9','#9b9cbd']},
  wall: {id:'lavender-stucco',label:'Lavender stucco',pattern:'plaster',colors:['#d1bfd9','#efdae4','#aaa1c6']},
  background: {id:'peach-orbit',label:'Peach orbital sunset',pattern:'sunset',colors:['#9c88c0','#efc3b9','#ffdfbb']},
 },
} as const satisfies Record<Lighting, SurfaceLook>;

export function finishPresets(target: 'floor' | 'wall' | 'background'): Record<string,string> {
 return Object.fromEntries(Object.values(SURFACE_LOOKS).map(look=>[look[target].id,look[target].label]));
}
