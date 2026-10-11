import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildObject } from '../src/views/objects';
import { OBJECT_KINDS } from '../src/core/types';
import { exposedCoplanarPairs } from './coplanar-audit';
import { disposeGroup } from '../src/views/resources';

globalThis.document = {createElement: () => ({getContext: () => new Proxy({}, {get: () => () => {}})})} as unknown as Document;
test('coplanar audit detects exposed overlaps but ignores buried joints and edge contact',()=>{
  const g=new THREE.Group();
  const a=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));a.name='a';
  const b=new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.5));b.name='b';b.position.set(.2,.25,0);
  g.add(a,b);
  assert.deepEqual(exposedCoplanarPairs(g),['a / b']);
  b.position.y=0;assert.deepEqual(exposedCoplanarPairs(g),[]);
  b.position.set(.75,.25,0);assert.deepEqual(exposedCoplanarPairs(g),[]);
});
for (const kind of OBJECT_KINDS) test(`${kind}: no exposed same-facing coplanar triangle overlaps`,()=>{
  const g=buildObject(kind);
  try {assert.deepEqual(exposedCoplanarPairs(g),[],kind);}finally{disposeGroup(g);}
});
