import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIGHTING_PRESETS } from '../src/core/appearance';
import { SURFACE_PRESETS, validSurface, type SurfaceTarget } from '../src/core/surfaces';
import { THEMES } from '../src/core/themes';
import { Store, newRoom, validateRoom } from '../src/core/store';
import { panelButtons, runPanelAction } from '../src/xr/interaction';

test('every lighting preset has a complete optional coordinated look with independent XR finishes', () => {
 const saved = new Map<string,string>();
 globalThis.localStorage = {getItem:(k:string)=>saved.get(k)??null,setItem:(k:string,v:string)=>saved.set(k,v)} as Storage;
 const store = new Store(newRoom());
 store.addItem({title:'Keep my room',sourceRef:'https://example.com'});
 store.setSoundtrack({mode:'track',track:'original'});
 const original = structuredClone(store.state);
 for (const lighting of Object.keys(LIGHTING_PRESETS)) {
  const theme = THEMES[`look-${lighting}`];
  assert.ok(theme, `missing coordinated look: ${lighting}`);
  assert.equal(theme.lighting, lighting);
  for (const target of ['floor','wall','background'] as SurfaceTarget[]) {
   const preset = theme.surfaces[target]!;
   assert.ok(preset, `${lighting} ${target}`);
   assert.ok(validSurface(target,preset));
   assert.ok(Object.hasOwn(SURFACE_PRESETS[target],preset.preset));
   const action = `surface:${target}:${preset.preset}`;
   assert.ok(panelButtons(store,'surfaces').some(b=>b.id===action));
   const before = structuredClone(store.state);
   runPanelAction(store,action);
   assert.deepEqual(store.state.surfaces?.[target],preset);
   assert.equal(store.state.lighting,before.lighting);
   for (const other of ['floor','wall','background'] as SurfaceTarget[]) if(other!==target) assert.deepEqual(store.state.surfaces?.[other],before.surfaces?.[other]);
  }
  const surfaces = structuredClone(store.state.surfaces);
  runPanelAction(store,`light:${lighting}`);
  assert.deepEqual(store.state.surfaces,surfaces,'lighting must never replace finishes');
  const before = structuredClone(store.state);
  runPanelAction(store,`theme:look-${lighting}`);
  assert.deepEqual(store.state.surfaces,theme.surfaces);
  assert.deepEqual(store.state.soundtrack,original.soundtrack);
  assert.deepEqual(store.state.placements,original.placements);
  assert.deepEqual(store.state.representations,original.representations);
  assert.deepEqual(store.state.contentItems,original.contentItems);
  assert.equal(validateRoom(JSON.parse(store.exportJson())),null);
  const imported = new Store(newRoom()); imported.replaceState(JSON.parse(store.exportJson()));
  assert.deepEqual(imported.state,store.state);
  assert.deepEqual(Store.loadSaved(),store.state);
  store.undo(); assert.deepEqual(store.state,before);
 }
});
