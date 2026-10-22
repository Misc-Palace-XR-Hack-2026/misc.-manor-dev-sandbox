import test from 'node:test';
import assert from 'node:assert/strict';
import { neighborhoodPlan, neighborhoodTheme, NEIGHBORHOOD_COURT_CAPACITY } from '../src/core/neighborhood-plan';
import { newRoom } from '../src/core/store';
test('overflow creates connected fixed-capacity branches without overlapping any room or spawn',()=>{
 const home=newRoom('Mine');const rooms=Array.from({length:61},(_,i)=>({id:'room:'+String(i).padStart(3,'0'),label:'R'+i,data:{...home,lighting:(i<29?'candlelight':i<45?'twilight':'emerald') as 'candlelight'|'twilight'|'emerald'}}));
 const plan=neighborhoodPlan(rooms,home);assert.equal(plan.length,61);assert.equal(new Set(plan.map(p=>p.id)).size,61);
 const branches=new Map<string,typeof plan>();for(const p of plan){const key=p.theme+':'+p.branch;branches.set(key,[...(branches.get(key)??[]),p]);assert.equal(p.connection[1],p.court[1]+24);assert.equal(p.connection[0],p.court[0]);}
 assert.ok(branches.size>4);for(const entries of branches.values())assert.ok(entries.length<=NEIGHBORHOOD_COURT_CAPACITY);
 for(let i=0;i<plan.length;i++)for(let j=i+1;j<plan.length;j++)assert.ok(Math.hypot(plan[i].position[0]-plan[j].position[0],plan[i].position[1]-plan[j].position[1])>11,'no overlapping pavilion footprints');
 assert.deepEqual(neighborhoodPlan([...rooms].reverse(),home),plan);
});

test('metadata deterministically clusters related rooms in distinct themed cul-de-sacs',()=>{
 const home=newRoom('Mine');home.lighting='twilight';
 const warm={...newRoom('Warm'),lighting:'candlelight' as const};
 const rooms=[{id:'home',label:'My room'},{id:'a',label:'A',data:warm},{id:'b',label:'B',data:{...warm,lighting:'sunset' as const}},{id:'c',label:'C',data:{...warm,lighting:'emerald' as const}}];
 const plan=neighborhoodPlan(rooms,home);
 assert.equal(plan.length,rooms.length);assert.equal(plan.find(p=>p.id==='a')!.theme,plan.find(p=>p.id==='b')!.theme);
 assert.notDeepEqual(plan.find(p=>p.id==='a')!.court,plan.find(p=>p.id==='c')!.court);
 assert.equal(neighborhoodTheme(home),'electric');
 assert.deepEqual(neighborhoodPlan([...rooms].reverse(),home).sort((a,b)=>a.id.localeCompare(b.id)),plan.sort((a,b)=>a.id.localeCompare(b.id)));
 for(const p of plan){assert.ok(Math.hypot(p.spawn[0]-p.position[0],p.spawn[1]-p.position[1])>=5);}
});
