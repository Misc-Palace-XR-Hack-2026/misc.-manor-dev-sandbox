import test from 'node:test';
import assert from 'node:assert/strict';
import {advance,beginLesson,currentStep,finish,LESSONS,loadOnboarding,persistOnboarding,progressLabel,skip,visibleTarget,ONBOARDING_KEY} from '../src/core/onboarding';

test('first launch, skip, completion, replay and action gating stay independent of room JSON',()=>{
 const memory=new Map<string,string>();
 const storage={getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>{memory.set(k,v);}};
 assert.equal(loadOnboarding(storage).status,'fresh');
 persistOnboarding('skipped',storage);
 assert.equal(JSON.parse(memory.get(ONBOARDING_KEY)!).status,'skipped');
 persistOnboarding('done',storage);
 const returning=loadOnboarding(storage);
 assert.equal(returning.status,'done');
 assert.equal(returning.lesson,null);
 const lesson=beginLesson('create','{"safe":true}','guest');
 assert.equal(progressLabel(lesson),'1 of 5');
 assert.equal(currentStep(lesson)?.target.includes('add-object'),true);
 assert.equal(advance(lesson,'typed-title').step,0,'wrong action must not advance');
 const after=advance(lesson,'open-add');
 assert.equal(after.step,1);
 assert.equal(progressLabel(after),'2 of 5');
 let state=after;
 for(const event of ['typed-title','typed-content','created','placed']) state=advance(state,event);
 assert.equal(state.lesson,null);
 assert.equal(finish(state).status,'done');
 const replay=beginLesson('move','{"safe":true}',null);
 assert.equal(replay.step,0);
 assert.equal(skip(replay).lesson,null);
 assert.ok(LESSONS.create.length>=4 && LESSONS.move.length>=4);
});

test('visibleTarget skips hidden leftover controls so a highlight cannot stay on the previous step',()=>{
  class FakeEl {
    hidden=false; id=''; dataset: Record<string,string>={};
    children: FakeEl[]=[];
    getBoundingClientRect(){ return {width:44,height:44,top:8,left:8}; }
    querySelector(sel: string){
      const walk=(n:FakeEl):FakeEl|null=>{
        if(sel.startsWith('#') && n.id===sel.slice(1)) return n;
        if(sel.includes('add-object') && n.dataset.tutorial==='add-object') return n;
        for(const c of n.children){ const hit=walk(c); if(hit) return hit; }
        return null;
      };
      for(const c of this.children){ const hit=walk(c); if(hit) return hit; }
      return null;
    }
    append(...nodes: FakeEl[]){ this.children.push(...nodes); }
  }
  const root=new FakeEl();
  const old=new FakeEl(); old.dataset.tutorial='add-object'; old.hidden=true;
  const next=new FakeEl(); next.id='new-object-title'; next.getBoundingClientRect=()=>({width:200,height:44,top:400,left:16});
  root.append(old,next);
  const found=visibleTarget('[data-tutorial="add-object"], #new-object-title', root as unknown as ParentNode);
  assert.equal(found, next);
});
