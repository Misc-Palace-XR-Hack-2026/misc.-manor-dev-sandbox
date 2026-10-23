import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchItems} from '../src/core/room-search';
import {newRoom} from '../src/core/store';
const room=newRoom('Search');
room.contentItems.push({id:'placed',title:'Zoë astronomy',type:'article',sourceKind:'url',sourceRef:'https://example.com/stars',notes:'Saturn observations',tags:['night sky'],createdAt:''},{id:'packed',title:'Old collection',type:'note',sourceKind:'note',sourceRef:'Typed content',tags:[],lastObjectKind:'rubiksCube',createdAt:''});
room.representations.push({id:'r',contentItemId:'placed',objectKind:'photoFrame'});
test('item search indexes title, source, notes, tags, assigned model kind/label and packed last model',()=>{
 for(const query of ['zoe','stars','saturn','night sky','photoFrame','photo frame']) assert.equal(searchItems(room,query)[0]?.item.id,'placed');
 for(const query of ['rubiksCube','puzzle cube','typed content']) {const hit=searchItems(room,query)[0];assert.equal(hit.item.id,'packed');assert.equal(hit.packed,true);assert.equal(hit.representationId,null);}
 assert.equal(searchItems(room,'night missing').length,0);
 assert.equal(searchItems(room,'').length,2);
});
test('link body participates in matching with a matched snippet, without modifying room saves',()=>{
 const before=JSON.stringify(room);
 const hits=searchItems(room,'nebula',new Map([[room.contentItems[0].sourceRef,{status:'ready',text:'Deep observation of the purple nebula beyond the stars.',fetchedAt:1}]]));
 assert.equal(hits.length,1);assert.match(hits[0].snippet,/nebula/);assert.equal(JSON.stringify(room),before);
});
