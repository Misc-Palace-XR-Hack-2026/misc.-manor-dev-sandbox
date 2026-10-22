import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

test('the dev sandbox mirrors the public build shortcut, pointing back to prod', () => {
  const nav = read('src/views/app-nav.ts');
  const demo = read('src/demo/demo-app.ts');

  // The public build keeps its small shortcut into the sandbox; the sandbox must not lose the way back.
  assert.match(demo, /\.href = `\$\{import\.meta\.env\.BASE_URL\}dev\/`/, 'public build still links to /dev/');
  assert.match(nav, /link\.href = import\.meta\.env\.BASE_URL/, 'sandbox links to the deployed public root');
  assert.doesNotMatch(nav, /https?:\/\//, 'no hardcoded origin: both hops stay BASE_URL-relative');

  // Mirrored affordance: a readable label, an accessible name, and a real link element.
  assert.match(nav, /createElement\('a'\)/);
  assert.match(nav, /textContent = 'prod'/);
  assert.match(nav, /title = 'Public build'/);

  // It is actually mounted in the sandbox entry point, not merely defined.
  const main = read('src/main.ts');
  assert.match(main, /createProdLink/, 'main.ts mounts the link');
  assert.match(main, /document\.body\.append\([\s\S]{0,120}?createProdLink\(\)\)/);
});

test('the prod shortcut keeps the public build styling and clears the chrome bar', () => {
  const css = read('src/style.css');
  const sandbox = css.slice(css.indexOf('.app-prod'));
  const demoCss = read('src/demo/demo.css');
  const publicPill = demoCss.slice(demoCss.indexOf('.demo-dev'));

  for (const rule of ['position: fixed', 'border-radius: 6px', 'padding: 3px 8px', 'text-decoration: none']) {
    assert.ok(publicPill.includes(rule), `public pill uses ${rule}`);
    assert.ok(sandbox.includes(rule), `sandbox pill mirrors ${rule}`);
  }
  assert.match(sandbox, /font: 11px\/1\.4 ui-monospace, monospace/, 'same quiet monospace treatment');
  assert.match(sandbox, /\.app-prod:hover, \.app-prod:focus-visible/, 'hover and keyboard focus both brighten');

  // The sandbox's bottom strip belongs to .chrome, so the pill must sit above it rather than under it.
  const bottom = /\.app-prod\s*\{[\s\S]*?bottom:\s*calc\(max\(16px, env\(safe-area-inset-bottom\)\) \+ (\d+)px\)/.exec(sandbox);
  assert.ok(bottom, 'pill is offset from the bottom edge');
  assert.ok(Number(bottom![1]) >= 60, 'offset clears the 44px chrome buttons plus their padding');
});
