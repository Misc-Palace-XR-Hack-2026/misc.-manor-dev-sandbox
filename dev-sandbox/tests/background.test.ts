import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RoomView } from '../src/views/room';

// Exercise the existing view seam without constructing DOM/WebGL objects.
function view(background: THREE.Scene['background']) {
 const room = Object.create(RoomView.prototype) as {
  scene: THREE.Scene; container: {clientWidth:number;clientHeight:number};
  fitBackground(immersive?:boolean):void;
 };
 room.scene = new THREE.Scene(); room.scene.background = background;
 room.container = {clientWidth:1200,clientHeight:800};
 return room;
}

test('immersive backgrounds use world-direction mapping, not the head-locked 2D shader', () => {
 const texture = new THREE.Texture({width:512,height:512});
 const room = view(texture);
 room.fitBackground();
 room.fitBackground(true);
 assert.equal(texture.mapping,THREE.EquirectangularReflectionMapping);
 assert.deepEqual(texture.repeat.toArray(),[1,1]);
 assert.deepEqual(texture.offset.toArray(),[0,0]);
 // Leaving and re-entering VR must preserve the desktop cover crop and same asset.
 room.fitBackground();
 assert.equal(texture.mapping,THREE.UVMapping);
 assert.deepEqual(texture.repeat.toArray(),[1,2/3]);
 assert.deepEqual(texture.offset.toArray(),[0,(1-2/3)/2]);
 assert.equal(room.scene.background,texture);
 room.fitBackground(true);
 assert.equal(texture.mapping,THREE.EquirectangularReflectionMapping);
});

test('original solid backgrounds and unloaded custom images are safe in both modes', () => {
 const color = new THREE.Color('#123456');
 for (const background of [color,null]) {
  const room = view(background);
  room.fitBackground(true);room.fitBackground();
  assert.equal(room.scene.background,background);
 }
 const texture = new THREE.Texture();
 const room = view(texture);
 room.fitBackground(true);
 assert.equal(texture.mapping,THREE.EquirectangularReflectionMapping);
 // Decode may complete after entering VR. Do not snapshot or replace the image.
 texture.image = {width:1800,height:900};
 room.fitBackground(true);
 room.fitBackground();
 assert.equal(texture.mapping,THREE.UVMapping);
 assert.deepEqual(texture.repeat.toArray(),[.75,1]);
 assert.deepEqual(texture.offset.toArray(),[.125,0]);
});
