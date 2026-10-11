#!/usr/bin/env node
import { mkdirSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MP_TEST_OUT ?? join(os.tmpdir(), 'misc-palace-tests');
mkdirSync(outDir, { recursive: true });
const files = readdirSync(root).filter((f) => f.endsWith('.test.ts'));
const bundled = [];
for (const file of files) {
  const out = join(outDir, file.replace(/\.ts$/, '.mjs'));
  const r = spawnSync(
    join(root, '../node_modules/.bin/esbuild'),
    [join(root, file), '--bundle', '--platform=node', '--format=esm', `--outfile=${out}`],
    { stdio: 'inherit' },
  );
  if (r.status) process.exit(r.status ?? 1);
  bundled.push(out);
}
const run = spawnSync(process.execPath, ['--test', ...bundled], { stdio: 'inherit' });
process.exit(run.status ?? 1);
