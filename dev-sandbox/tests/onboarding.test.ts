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
 assert.equal(progressLabel(lesson),'1 of 9');
 assert.equal(currentStep(lesson)?.target.includes('add-object'),true);
 assert.equal(advance(lesson,'typed-title').step,0,'wrong action must not advance');
 const after=advance(lesson,'open-add');
 assert.equal(after.step,1);
 assert.equal(progressLabel(after),'2 of 9');
 let state=after;
 for(const event of ['create-invalid','create-cancel','open-add','typed-title','typed-content','kind-chosen','created','placed']) state=advance(state,event);
 assert.equal(state.lesson,null);
 assert.equal(finish(state).status,'done');
 const replay=beginLesson('move','{"safe":true}',null,'done');
 assert.equal(replay.step,0);
 assert.equal(replay.status,'done');
 assert.equal(skip(replay).lesson,null);
 assert.equal(skip(replay).status,'done');
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

test('bookmark walkthrough gates file results, duplicate retry, recovery and undo separately',()=>{
 let s=beginLesson('bookmarks','', 'guest');
 assert.equal(currentStep(s)?.event,'export-ready');
 s=advance(s,'export-ready');
 assert.equal(advance(s,'created').step,s.step);
 assert.equal(currentStep(s)?.event,'import-empty');
 for(const event of ['import-empty','imported','import-duplicate','inbox-open','stashed','restored','import-undone']) s=advance(s,event);
 assert.equal(s.lesson,null);
});

test('creation explicitly practices invalid input, cancellation, representation choice and placement',()=>{
 assert.deepEqual(LESSONS.create.map(s=>s.event),['open-add','create-invalid','create-cancel','open-add','typed-title','typed-content','kind-chosen','created','placed']);
});
test('move includes cancellation and style includes every individual surface and revert',()=>{
 assert.ok(LESSONS.move.some(s=>s.event==='move-cancelled'));
 for(const event of ['theme-applied','styled','surface-wall','surface-floor','surface-background','style-reverted']) assert.ok(LESSONS.style.some(s=>s.event===event),event);
});
