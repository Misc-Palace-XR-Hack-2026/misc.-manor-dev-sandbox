import { Store } from '../core/store';
import { advance, beginLesson, currentStep, finish, loadOnboarding, persistOnboarding, progressLabel, skip, visibleTarget, type LessonId, type OnboardingState } from '../core/onboarding';

export class TutorialView {
  state: OnboardingState;
  private overlay = document.createElement('div');
  private card = document.createElement('section');
  private highlight = document.createElement('div');
  private practiceId: string | null = null;
  constructor(private store: Store, private onVr?: (page: 'welcome' | 'guide' | 'home') => void) {
    this.state = loadOnboarding();
    this.overlay.className = 'tutorial-overlay';
    this.overlay.hidden = true;
    this.highlight.className = 'tutorial-highlight';
    this.card.className = 'tutorial-card';
    this.overlay.append(this.highlight, this.card);
    document.body.append(this.overlay);
    document.addEventListener('palace-tutorial', (event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail === 'replay') this.replay('create');
      else if (detail === 'start') this.start('create');
      else if (detail?.startsWith('lesson:')) this.start(detail.slice(7) as LessonId);
      else if (detail === 'skip') this.goToRoom();
      else if (this.state.lesson) this.notice(detail);
    });
    this.store.subscribe(() => this.observeStore());
    if (this.state.status === 'fresh') this.showWelcome();
    else this.overlay.hidden = true;
  }
  replay(lesson: LessonId = 'create'): void {
    this.start(lesson);
  }
  notice(event: string): void {
    if (!this.state.lesson) return;
    const before = this.state.snapshot;
    this.state = advance(this.state, event);
    if (!this.state.lesson) {
      persistOnboarding('done');
      this.restorePractice(before);
      this.state = finish(this.state);
      this.render();
      this.onVr?.('home');
      return;
    }
    this.render();
  }
  private showWelcome(): void {
    this.overlay.hidden = false;
    this.highlight.hidden = true;
    this.card.replaceChildren();
    const title = document.createElement('h2'); title.textContent = 'Welcome';
    const copy = document.createElement('p'); copy.textContent = 'Start a short practice walkthrough, or go straight to your room. Returning visits are not forced through this screen.';
    const start = button('Start tutorial', () => this.start('create'));
    start.dataset.tutorial = 'start';
    const room = button('Go to room', () => this.goToRoom());
    room.dataset.tutorial = 'go-room';
    this.card.append(title, copy, start, room);
    this.onVr?.('welcome');
  }
  private start(lesson: LessonId): void {
    this.practiceId = this.ensurePractice(lesson);
    this.state = beginLesson(lesson, this.store.exportJson(), this.store.roomId ?? null);
    this.render();
    this.onVr?.('guide');
  }
  private goToRoom(): void {
    persistOnboarding('skipped');
    this.state = skip(this.state);
    this.overlay.hidden = true;
    this.onVr?.('home');
  }
  private render(): void {
    const step = currentStep(this.state);
    if (!step) { this.overlay.hidden = true; this.highlight.hidden = true; return; }
    this.overlay.hidden = false;
    this.card.replaceChildren();
    const progress = document.createElement('p'); progress.className = 'tutorial-progress'; progress.textContent = progressLabel(this.state);
    const title = document.createElement('h2'); title.textContent = step.title;
    const prompt = document.createElement('p'); prompt.textContent = step.prompt;
    const skipBtn = button('Skip / Exit', () => {
      this.restorePractice(this.state.snapshot);
      persistOnboarding(this.state.status === 'fresh' ? 'skipped' : this.state.status);
      this.state = skip(this.state);
      this.render();
      this.onVr?.('home');
    });
    this.card.append(progress, title, prompt, skipBtn);
    this.highlight.hidden = true;
    requestAnimationFrame(() => this.placeHighlight(step.target));
  }
  private placeHighlight(selector: string): void {
    const node = visibleTarget(selector);
    if (!(node instanceof HTMLElement)) { this.highlight.hidden = true; return; }
    const box = node.getBoundingClientRect();
    this.highlight.hidden = false;
    this.highlight.style.left = `${box.left - 6}px`;
    this.highlight.style.top = `${box.top - 6}px`;
    this.highlight.style.width = `${box.width + 12}px`;
    this.highlight.style.height = `${box.height + 12}px`;
  }
  private observeStore(): void {
    if (!this.state.lesson) return;
    if (this.store.selectedId) this.notice('selected');
    if (this.store.holding) this.notice('picked');
    if (this.practiceId && this.store.slotOf(this.practiceId)) this.notice('placed');
    if (this.practiceId && !this.store.state.representations.some((r) => r.id === this.practiceId)) this.notice('stashed');
    if (this.state.roomId && this.store.roomId === this.state.roomId && this.state.lesson === 'rooms' && this.state.step >= 1) this.notice('returned');
  }
  private ensurePractice(lesson: LessonId): string | null {
    if (lesson !== 'move') return null;
    const existing = this.store.state.representations[0]?.id;
    if (existing) return existing;
    return this.store.addItem({ title: 'Practice object', sourceRef: 'note:practice', type: 'note' });
  }
  private restorePractice(snapshot: string | null): void {
    if (!snapshot) return;
    try { this.store.replaceState(JSON.parse(snapshot)); } catch { /* keep the live room if practice restore fails */ }
    this.practiceId = null;
  }
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.addEventListener('click', onClick);
  return node;
}
