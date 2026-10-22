import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, newRoom } from '../src/core/store';
import { XrPanel } from '../src/xr/panel';
import { XrHoverLabel } from '../src/xr/hover';
import { HUD, hudPanel } from '../src/xr/hud';
import * as THREE from 'three';

let paints = 0;
const colors: string[] = [];
const text: string[] = [];
const context = {
  fillStyle: '', font: '',
  clearRect() {},
  fillRect() { colors.push(this.fillStyle); },
  fillText(value: string) { paints++; text.push(value); },
  measureText(s: string) { return { width: s.length * 14 }; },
};
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } as unknown as Document;
globalThis.localStorage = { getItem: () => null, setItem() {} } as unknown as Storage;

test('hover label truncates long text instead of squeezing its font into an unreadable line', () => {
  text.length = 0;
  const label = new XrHoverLabel();
  label.show({ title: 'Long title '.repeat(30), detail: 'Long description '.repeat(30) }, new THREE.Vector3(), new THREE.PerspectiveCamera());
  assert.ok(text[0].endsWith('…'));
  assert.ok(text[1].endsWith('…'));
  assert.ok(text.slice(0, 2).every(t => t.length * 14 <= 712));
});

test('validation errors remain readable even when the selected title is very long', () => {
  const store = new Store(newRoom());
  const id = store.addItem({ title: 'Long title '.repeat(40), sourceRef: 'note', type: 'note', kind: 'notebook' });
  store.select(id);
  const panel = new XrPanel(store, () => {});
  panel.draft.error = 'Enter a valid URL';
  text.length = 0;
  panel.show('create', true);
  assert.ok(text.includes('Enter a valid URL'));
});

test('HUD paints neutral translucent glass rather than opaque colored slabs', () => {
  colors.length = 0;
  const panel = new XrPanel(new Store(newRoom()), () => {});
  panel.show();
  const glass = colors.filter(color => color.startsWith('rgba('));
  assert.ok(glass.length > 0, 'canvas surfaces must carry real alpha');
  assert.ok(glass.includes('rgba(18, 20, 24, 0.38)'), 'neutral smoky panel retains 62% world transmission');
  assert.ok(!colors.includes('#0b2028'), 'no opaque teal substrate');
  const material = panel.mesh.material;
  assert.equal(material.transparent, true);
  assert.equal(material.depthWrite, false, 'glass must not occlude later transparent surfaces');
});

test('glass headers keep opaque white labels and a text-only contrast shadow for bright worlds', () => {
  const c = { ...context, shadowBlur: 0, shadowColor: '', shadowOffsetY: 0 };
  hudPanel(c as unknown as CanvasRenderingContext2D, 1024, 1408);
  assert.equal(HUD.text, '#ffffff');
  assert.ok(c.shadowBlur >= 4, 'bare glass headers need localized contrast, not a full opaque backplate');
  assert.equal(c.shadowColor, 'rgba(0, 0, 0, 0.95)');
});

test('HUD clears hover feedback when the controller leaves and avoids repainting unchanged hover', () => {
  const panel = new XrPanel(new Store(newRoom()), () => {});
  panel.show();
  const uv = { x: .5, y: 1 - 220 / 1408 };
  panel.setHover(uv);
  const hovered = paints;
  panel.setHover(uv);
  assert.equal(paints, hovered, 'stationary rays should not upload the canvas every frame');
  panel.setHover(null);
  assert.ok(paints > hovered, 'leaving must remove the visible highlight');
});
