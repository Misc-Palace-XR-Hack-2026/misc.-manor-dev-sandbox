import { Store } from '../core/store';
import { EMPTY_BOOKMARKS, tutorialBookmarks, type BookmarkEntry } from '../core/bookmarks';
import { advance, beginLesson, currentStep, finish, LESSONS, loadOnboarding, persistOnboarding, progressLabel, skip, visibleTarget, type LessonId, type OnboardingState } from '../core/onboarding';

/** Shared lesson runner: UI events for controls, state transitions for successful mutations. */
export class TutorialView {
  state: OnboardingState;
  private overlay = document.createElement('div');
  private card = document.createElement('section');
  private highlight = document.createElement('div');
  private practiceId: string | null = null;
  private contentId: string | null = null;
  private overflow = new Set<string>();
  private previous = '';
  private previousRoom?: string;
  private previousSelected: string | null = null;
  private previousHolding: string | null = null;
  private result = '';
  private busy = false;
  constructor(private store: Store, private onVr?: (page: 'welcome' | 'guide' | 'home') => void) {
    this.state = loadOnboarding();
    this.overlay.className = 'tutorial-overlay'; this.overlay.hidden = true;
    this.highlight.className = 'tutorial-highlight'; this.card.className = 'tutorial-card';
    this.card.setAttribute('aria-label','Practice tutorial');
    this.overlay.append(this.highlight, this.card); document.body.append(this.overlay);
    document.addEventListener('palace-tutorial', event => {
      if (!this.store.canEdit) return;
      const detail = (event as CustomEvent<string>).detail;
      if (detail === 'replay') this.picker();
      else if (detail === 'start') this.start('bookmarks');
      else if (detail?.startsWith('lesson:') && detail.slice(7) in LESSONS) this.start(detail.slice(7) as LessonId);
      else if (detail === 'skip') this.goToRoom();
      else this.notice(detail);
    });
    document.addEventListener('palace-import', event => {
      if (!this.store.canEdit || this.state.lesson !== 'bookmarks') return;
      const {entries,added,placed} = (event as CustomEvent<{entries:BookmarkEntry[];added:number;placed:number}>).detail;
      this.result = `${added} added · ${placed} placed · ${added-placed} to Inbox. Folder tags: ${[...new Set(entries.map(e=>e.folder).filter(Boolean))].join(', ') || 'none'}.`;
      if (!entries.length && !added) this.accept('import-empty');
      else if (added > 0 && placed > 0 && added > placed && entries.every(e=>e.url.startsWith('https://example.com/practice/'))) {
        this.overflow = new Set(this.store.state.contentItems.filter(c=>!this.store.repFor(c.id)).map(c=>c.id));
        this.accept('imported');
      } else if (entries.length && !added) this.accept('import-duplicate');
      this.render();
    });
    this.store.subscribe(() => queueMicrotask(() => this.observeStore()));
    const track = () => { if (this.state.lesson) this.placeHighlight(this.target()); requestAnimationFrame(track); };
    requestAnimationFrame(track);
    if (this.state.status === 'fresh') this.showWelcome();
  }
  get targetRepresentationId(): string | null { return this.state.lesson==='move' ? this.practiceId : null; }
  replay(lesson?: LessonId): void { if (lesson) this.start(lesson); else this.picker(); }
  /** Only non-mutating control events are trusted here. Successful mutations are observed below. */
  notice(event: string): void {
    if (!this.store.canEdit) return;
    if (!this.state.lesson) return;
    if (event==='theme-applied' && this.store.lastCommand!=='applyLook') return;
    if (['open-add','open-rooms','open-style','typed-title','typed-content','kind-chosen','create-invalid','create-cancel','inbox-open','theme-applied'].includes(event)) this.accept(event);
  }
  private accept(event: string): void {
    const next = advance(this.state,event);
    if (next === this.state) return;
    this.state = next;
    if (!next.lesson) {
      this.busy = true; this.store.endPractice(); this.busy = false;
      persistOnboarding('done'); this.state = finish(next); this.onVr?.('home');
      document.dispatchEvent(new CustomEvent('palace-reveal',{detail:'close'}));
    }
    this.capture(); this.render();
  }
  private capture(): void {
    this.previous = this.store.exportJson(); this.previousRoom = this.store.roomId;
    this.previousSelected = this.store.selectedId; this.previousHolding = this.store.holding;
  }
  private showWelcome(): void {
    this.overlay.hidden = false; this.highlight.hidden = true; this.card.replaceChildren();
    const title = document.createElement('h2'); title.textContent = 'Welcome';
    const copy = document.createElement('p'); copy.textContent = 'Optional practice uses disposable rooms. Personal saves stay untouched. Reload discards practice; Help offers replay.';
    this.card.append(title,copy,button('Start tutorial',()=>this.start('bookmarks')),button('Go to room',()=>this.goToRoom()));
    this.onVr?.('welcome');
  }
  private picker(): void {
    if (!this.store.canEdit) return;
    this.goToRoom(); this.overlay.hidden = false; this.card.replaceChildren();
    Object.assign(this.card.style,{top:'72px',bottom:'auto',maxHeight:'60vh'});
    const title = document.createElement('h2'); title.textContent = 'Practice lessons'; this.card.append(title);
    for (const [id,label] of Object.entries({bookmarks:'Import bookmarks',create:'Create content',move:'Move, stash and restore',rooms:'Visit local rooms',style:'Themes, lighting and surfaces'})) this.card.append(button(label,()=>this.start(id as LessonId)));
    this.card.append(button('Go to room',()=>this.goToRoom()));
  }
  private start(lesson: LessonId): void {
    if (!this.store.canEdit) return;
    const status = this.state.status === 'fresh' ? 'fresh' : this.state.status;
    this.busy = true; this.state = skip(this.state); this.store.beginPractice();
    this.practiceId = null; this.contentId = null; this.result = ''; this.overflow.clear();
    if (lesson === 'move') {
      this.practiceId = this.store.addItem({title:'Practice object',sourceRef:'A sample note',type:'note'});
      this.contentId = this.store.state.representations.find(r=>r.id===this.practiceId)!.contentItemId;
      this.store.addItem({title:'Occupied pad',sourceRef:'Another sample',type:'note'});
    }
    this.state = beginLesson(lesson,'',this.store.roomId ?? 'guest', status);
    this.busy = false; this.capture(); this.render(); this.onVr?.('guide');
  }
  private goToRoom(): void {
    this.state = skip(this.state); this.busy = true; this.store.endPractice(); this.busy = false;
    persistOnboarding(this.state.status); this.overlay.hidden = true; this.highlight.hidden = true;
    document.dispatchEvent(new CustomEvent('palace-reveal',{detail:'close'})); this.onVr?.('home');
  }
  private target(): string {
    const step = currentStep(this.state); if (!step) return '';
    if(step.event==='placed' && !this.store.holding && this.practiceId) return `[data-rep-id="${this.practiceId}"] [data-action="pick-up"]`;
    if (['move-select','move-pick-again'].includes(step.id) && this.practiceId) return `[data-rep-id="${this.practiceId}"]`;
    if (step.id === 'rooms-switch') return `[data-room-id]:not([data-room-id="${this.state.roomId}"])`;
    if (step.id === 'rooms-home') return `[data-room-id="${this.state.roomId}"]`;
    if (step.id === 'move-restore' && this.contentId) return `[data-content-id="${this.contentId}"] [data-action="bring-out"]`;
    if (step.id === 'import-restore') return [...this.overflow].map(id=>`[data-content-id="${id}"] [data-action="bring-out"]`).join(',');
    return step.target;
  }
  private reveal(): void {
    const id = currentStep(this.state)?.id ?? '';
    const panel = id.startsWith('import-') && !['import-inbox','import-stash','import-restore','import-undo'].includes(id) ? 'import' : id.startsWith('create-') && id !== 'create-place' ? 'add' : id.startsWith('rooms-') ? 'rooms' : 'editor';
    document.dispatchEvent(new CustomEvent('palace-reveal',{detail:panel}));
    requestAnimationFrame(()=> { const node=visibleTarget(this.target()); if(node instanceof HTMLElement) node.scrollIntoView({block:'nearest'}); });
  }
  private render(): void {
    const step = currentStep(this.state);
    if (!step) { this.overlay.hidden = true; this.highlight.hidden = true; return; }
    this.overlay.hidden = false; this.card.replaceChildren();
    const progress = document.createElement('p'); progress.className='tutorial-progress'; progress.textContent=`Practice · ${progressLabel(this.state)}`;
    const title = document.createElement('h2'); title.textContent=step.title;
    const prompt = document.createElement('p'); prompt.textContent=step.prompt;
    this.card.append(progress,title,prompt);
    if (this.result) { const result=document.createElement('p'); result.textContent=this.result; result.setAttribute('role','status'); this.card.append(result); }
    if (this.state.lesson === 'bookmarks' && this.state.step < 4) {
      for (const [name,text] of [['tutorial-bookmarks.html',tutorialBookmarks(this.store.layout.slots.length)],['tutorial-empty-malformed.html',EMPTY_BOOKMARKS]]) {
        const link=document.createElement('a'); link.textContent=`Download ${name}`; link.download=name;
        link.href='data:text/html;charset=utf-8,'+encodeURIComponent(text); this.card.append(link);
      }
      if (this.state.step === 0) { const ready=button('Export or sample ready',()=>this.accept('export-ready')); ready.dataset.tutorial='export-ready'; this.card.append(ready); }
    }
    this.card.scrollTop=0;
    this.card.append(button('Restart lesson',()=>this.start(step.lesson)),button('Other lessons',()=>this.picker()));
    const body = document.createElement('div'); body.className = 'tutorial-body';
    body.append(...Array.from(this.card.childNodes));
    const actions = document.createElement('div'); actions.className = 'tutorial-actions';
    actions.append(button('Show control',()=>this.reveal()),button('Skip / Exit',()=>this.goToRoom()));
    this.card.append(body,actions);
    this.highlight.hidden=true;
  }
  private placeHighlight(selector: string): void {
    const node=visibleTarget(selector);
    if (!(node instanceof HTMLElement)) { this.highlight.hidden=true; return; }
    const box=node.getBoundingClientRect();
    if(box.bottom<0 || box.top>innerHeight || box.right<0 || box.left>innerWidth) { this.highlight.hidden=true; return; }
    this.highlight.hidden=false;
    Object.assign(this.highlight.style,{left:`${box.left-6}px`,top:`${box.top-6}px`,width:`${box.width+12}px`,height:`${box.height+12}px`});
    if(this.card.contains(node)) return;
    // Prefer the opposite side of the actual control, including narrow touch viewports.
    this.card.style.top = 'auto'; this.card.style.bottom = 'auto';
    const above=box.top-88, below=innerHeight-box.bottom-118;
    if(above>=below) { this.card.style.top='72px'; this.card.style.maxHeight=`${Math.min(innerHeight*.45,Math.max(100,above))}px`; }
    else { this.card.style.bottom='100px'; this.card.style.maxHeight=`${Math.min(innerHeight*.45,Math.max(100,below))}px`; }
  }
  private observeStore(): void {
    if (!this.store.canEdit) { this.overlay.hidden = true; this.highlight.hidden = true; this.capture(); return; }
    if (this.state.lesson && this.overlay.hidden) { this.capture(); this.render(); }
    if (this.busy || !this.state.lesson || !this.store.practicing || !this.previous) return;
    const old=JSON.parse(this.previous) as Store['state'], now=this.store.state;
    const event=currentStep(this.state)?.event;
    let observed='';
    if (event === 'created' && ['addItem','addPhoto','pickUp'].includes(this.store.lastCommand)) {
      const rep=now.representations.find(r=>!old.representations.some(o=>o.id===r.id));
      if(rep) {this.practiceId=rep.id; this.contentId=rep.contentItemId; observed='created';}
    }
    if (this.practiceId) {
      const oldSlot=old.placements.find(p=>p.representationId===this.practiceId)?.slotId;
      const slot=this.store.slotOf(this.practiceId);
      if(event==='selected' && this.store.selectedId===this.practiceId && this.previousSelected!==this.practiceId) observed='selected';
      if(event==='picked' && this.store.holding===this.practiceId && this.previousHolding!==this.practiceId) observed='picked';
      if(event==='placed' && this.store.lastCommand==='place' && slot && !oldSlot && this.previousHolding===this.practiceId && !this.store.holding) observed='placed';
      if(event==='move-cancelled' && slot && this.previousHolding===this.practiceId && !this.store.holding && this.store.selectedId===null) observed='move-cancelled';
      if(event==='stashed' && old.representations.some(r=>r.id===this.practiceId) && !now.representations.some(r=>r.id===this.practiceId) && now.contentItems.some(c=>c.id===this.contentId)) observed='stashed';
      if(event==='restored' && this.contentId) {
        const rep=this.store.repFor(this.contentId);
        if(rep && !old.representations.some(r=>r.contentItemId===this.contentId) && this.store.slotOf(rep.id)) observed='restored';
      }
    }
    if(this.state.lesson==='bookmarks') {
      if(event==='stashed' && now.representations.length<old.representations.length && now.contentItems.length===old.contentItems.length) observed='stashed';
      if(event==='restored' && now.representations.some(r=>this.overflow.has(r.contentItemId) && !old.representations.some(o=>o.contentItemId===r.contentItemId) && this.store.slotOf(r.id))) observed='restored';
      if(event==='import-undone' && this.store.lastCommand==='undo' && old.contentItems.length>0 && now.contentItems.length===0) observed='import-undone';
    }
    if(event==='switched' && this.store.roomId!==this.previousRoom && this.store.roomId!==this.state.roomId) observed='switched';
    if(event==='returned' && this.store.roomId!==this.previousRoom && this.store.roomId===this.state.roomId) observed='returned';
    if(event==='styled' && this.store.lastCommand==='setLighting' && old.lighting!==now.lighting) observed='styled';
    for(const target of ['wall','floor','background'] as const) if(event===`surface-${target}` && this.store.lastCommand==='setSurface' && JSON.stringify(old.surfaces?.[target])!==JSON.stringify(now.surfaces?.[target])) observed=event;
    if(event==='style-reverted' && this.store.lastCommand==='undo' && !this.store.canUndo && !now.surfaces && !now.lighting) observed=event;
    this.capture(); if(observed) this.accept(observed);
  }
}
function button(label:string,onClick:()=>void):HTMLButtonElement {
  const node=document.createElement('button'); node.type='button'; node.textContent=label; node.addEventListener('click',onClick); return node;
}
