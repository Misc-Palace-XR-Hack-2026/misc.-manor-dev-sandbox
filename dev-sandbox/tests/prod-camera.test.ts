import test from 'node:test';
import assert from 'node:assert/strict';
import { VrCameraEntry } from '../src/core/vr-camera';
test('VR capability stays hidden while pending; secure context and successful support required',async()=>{
 let resolve!:(v:boolean)=>void;
 const gate=new VrCameraEntry();
 const pending=gate.probe({isSecureContext:true,xr:{isSessionSupported:()=>new Promise(r=>resolve=r)}});
 assert.equal(gate.available,false);resolve(true);await pending;assert.equal(gate.available,true);
 await gate.probe({isSecureContext:false,xr:null});assert.equal(gate.available,false);
 await gate.probe({isSecureContext:true,xr:{isSessionSupported:async()=>{throw Error('denied')}}});assert.equal(gate.available,false);
});
test('entry calls request immediately on gesture, primes once, locks duplicates and resets on rejection',async()=>{
 const gate=new VrCameraEntry();await gate.probe({isSecureContext:true,xr:{isSessionSupported:async()=>true}});
 const calls:string[]=[];let reject!:(e:Error)=>void;
 const pending=gate.enter(()=>calls.push('prime'),()=>{calls.push('request');return new Promise<void>((_,r)=>reject=r)});
 assert.deepEqual(calls,['prime','request']);assert.equal(gate.pending,true);
 await gate.enter(()=>calls.push('duplicate'),async()=>{});reject(Error('cancelled'));
 await assert.rejects(pending,/cancelled/);assert.equal(gate.pending,false);
});
