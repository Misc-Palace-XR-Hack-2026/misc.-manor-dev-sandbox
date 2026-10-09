import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OBJECT_KINDS, OBJECT_LABELS } from '../src/core/types';
import { buildKindInventory } from '../src/views/kind-picker';

function node() {
  const attrs: Record<string, string> = {};
  const children: unknown[] = [];
  const listeners: Record<string, Array<(e?: { stopPropagation(): void }) => void>> = {};
  const el = {
    tagName: 'DIV',
    className: '',
    textContent: '',
    hidden: false,
    dataset: {} as Record<string, string>,
    children,
    classList: {
      toggle(name: string, on?: boolean) {
        const parts = new Set(el.className.split(/\s+/).filter(Boolean));
        const should = on ?? !parts.has(name);
        if (should) parts.add(name); else parts.delete(name);
        el.className = [...parts].join(' ');
      },
    },
    setAttribute(name: string, value: string) { attrs[name] = value; },
    getAttribute(name: string) { return attrs[name] ?? null; },
    addEventListener(type: string, fn: () => void) { (listeners[type] ??= []).push(fn); },
    click() { for (const fn of listeners.click ?? []) fn({ stopPropagation() {} }); },
    append(...nodes: unknown[]) { children.push(...nodes); },
    replaceChildren(...nodes: unknown[]) { children.length = 0; children.push(...nodes); },
    querySelectorAll(sel: string) {
      const out: unknown[] = [];
      const walk = (n: { className?: string; children?: unknown[] }) => {
        if (typeof n.className === 'string' && n.className.split(/\s+/).includes(sel.replace('.', ''))) out.push(n);
        for (const c of n.children ?? []) walk(c as { className?: string; children?: unknown[] });
      };
      walk(el);
      return out;
    },
  };
  return el;
}

globalThis.document = {
  createElement: (tag: string) => {
    const n = node();
    n.tagName = tag.toUpperCase();
    return n;
  },
} as unknown as Document;

test('inventory shows only the active object until tapped, then the full picker', () => {
  let current: string = 'book';
  const root = buildKindInventory({
    value: 'book',
    onChange: (kind) => { current = kind; },
  });
  const currentBtn = root.querySelectorAll('.kind-current')[0] as {
    children: Array<{ textContent?: string }>;
    click(): void;
    getAttribute(name: string): string | null;
  };
  const picker = root.querySelectorAll('.kind-picker')[0] as { hidden: boolean; querySelectorAll(sel: string): Array<{ click(): void; dataset: { kind: string } }> };
  assert.equal(currentBtn.getAttribute('aria-expanded'), 'false');
  assert.equal(picker.hidden, true);
  assert.ok(currentBtn.children.some((c) => (c.textContent ?? '').includes(OBJECT_LABELS.book)));

  currentBtn.click();
  assert.equal(currentBtn.getAttribute('aria-expanded'), 'true');
  assert.equal(picker.hidden, false);
  assert.equal(picker.querySelectorAll('.kind-choice').length, OBJECT_KINDS.length);

  const tv = picker.querySelectorAll('.kind-choice').find((b) => b.dataset.kind === 'tv')!;
  tv.click();
  assert.equal(current, 'tv');
  assert.equal(picker.hidden, true);
  assert.equal(currentBtn.getAttribute('aria-expanded'), 'false');
  assert.ok(currentBtn.children.some((c) => (c.textContent ?? '').includes(OBJECT_LABELS.tv)));
});
