import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchRooms} from '../src/core/room-search';
import {newRoom} from '../src/core/store';
const room = newRoom('Zoë');
room.contentItems.push({id:'c1',title:'A telescope',type:'article',sourceKind:'url',sourceRef:'https://example.com/astronomy',tags:['night sky'],notes:'Observing Saturn',createdAt:'2026-10-22T00:00:00Z'});
const catalog=[{id:'home',label:'My room'},{id:'space',label:'Star room',data:room}];
test('room search lists all rooms with an empty query',()=>assert.deepEqual(searchRooms(catalog,'  '),catalog));
test('room search matches names, owners, titles, tags, links and notes ignoring case and accents',()=>{
 for(const query of ['STAR','zoe','telescope','night sky','astronomy','saturn']) assert.deepEqual(searchRooms(catalog,query).map(r=>r.id),['space']);
});
test('all keywords must match and unknown keywords return no rooms',()=>{
 assert.equal(searchRooms(catalog,'star saturn').length,1);
 assert.deepEqual(searchRooms(catalog,'star banana'),[]);
 assert.deepEqual(searchRooms(catalog,'banana'),[]);
});
