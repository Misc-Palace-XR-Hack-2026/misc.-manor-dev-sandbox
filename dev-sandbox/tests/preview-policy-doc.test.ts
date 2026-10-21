import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// The blocklist policy is only honest if it is written down. These tests keep the documented policy in
// sync with the code, so a host cannot be blocked (or unblocked) without a recorded rationale.

const root = process.cwd();
const policyPath = join(root, 'docs/public-preview-policy.md');
const source = readFileSync(join(root, 'src/core/preview.ts'), 'utf8');

/** Hosts listed in the PAGE_BLOCKLIST literal, read from source so the doc cannot drift. */
function blocklistHosts(): string[] {
  const block = /const PAGE_BLOCKLIST = \[([\s\S]*?)\] as const;/.exec(source);
  assert.ok(block, 'preview.ts must declare a PAGE_BLOCKLIST');
  const hosts = [...block[1].matchAll(/'([a-z0-9.-]+)'/g)].map((m) => m[1]);
  assert.ok(hosts.length >= 10, 'blocklist should not be empty');
  return hosts;
}

test('the public preview policy is documented, not only coded', () => {
  assert.ok(existsSync(policyPath), 'docs/public-preview-policy.md must exist');
  const doc = readFileSync(policyPath, 'utf8');
  for (const topic of [
    'Exact host', 'subdomain', 'Maintenance', 'Ownership',
    'frame-ancestors', 'X-Frame-Options', 'sandbox',
    'Open in browser', 'mixed content', 'Support and limitations',
  ]) {
    assert.match(doc, new RegExp(topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), topic);
  }
});

test('the policy names the limits a browser-side policy genuinely cannot enforce', () => {
  const doc = readFileSync(policyPath, 'utf8');
  for (const limit of ['DNS rebinding', 'redirect chain', 'SSRF']) {
    assert.match(doc, new RegExp(limit, 'i'), limit);
  }
  // Must not claim a load event or eligibility proves the page rendered.
  assert.match(doc, /load event is not|not proof of/i, 'load is not success');
  assert.match(doc, /no proxy|without proxy|never prox/i, 'no proxy or header rewriting');
  assert.match(doc, /#27/, 'VR parity stays separate');
});

test('every blocked host is listed in the policy doc with its matching rule', () => {
  const doc = readFileSync(policyPath, 'utf8');
  for (const host of blocklistHosts()) {
    assert.ok(doc.includes(host), `${host} is blocked in code but undocumented`);
  }
});

test('the documented blocklist does not list hosts the code never blocks', () => {
  const doc = readFileSync(policyPath, 'utf8');
  const hosts = new Set(blocklistHosts());
  const table = doc.slice(doc.indexOf('## Blocklist'));
  for (const [, host] of table.matchAll(/^\| `([a-z0-9.-]+)` \|/gm)) {
    assert.ok(hosts.has(host), `${host} is documented as blocked but absent from PAGE_BLOCKLIST`);
  }
});
