import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Dev-server only: lets Scenes mode write shot captures (plate PNG, shot card, diagrams) straight into the repo, in
// docs/trailer-materials/shots/<shot-folder>/, instead of the browser's Downloads folder. Not part of `vite build`.

const root = path.dirname(fileURLToPath(import.meta.url));
const shotsDir = path.join(root, 'docs', 'trailer-materials', 'shots');
const FOLDER = /^[a-z0-9][a-z0-9-]{0,60}$/;
const FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
const MAX_BYTES = 80 * 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BYTES) { reject(new Error('Request too large.')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function shotsPlugin() {
  return {
    name: 'sandbox-shots',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shots/list', (req, res) => {
        if (req.method !== 'GET') return send(res, 405, { error: 'GET only.' });
        const folders = fs.existsSync(shotsDir)
          ? fs.readdirSync(shotsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
          : [];
        send(res, 200, { folders });
      });

      server.middlewares.use('/__shots/save', async (req, res) => {
        if (req.method !== 'POST') return send(res, 405, { error: 'POST only.' });
        try {
          const { folder, files } = JSON.parse(await readBody(req));
          if (typeof folder !== 'string' || !FOLDER.test(folder)) return send(res, 400, { error: 'Bad folder name.' });
          if (!Array.isArray(files) || files.length === 0 || files.length > 20) return send(res, 400, { error: 'Bad file list.' });
          const dir = path.join(shotsDir, folder);
          fs.mkdirSync(dir, { recursive: true });
          const written = [];
          for (const file of files) {
            if (typeof file?.name !== 'string' || !FILE.test(file.name) || typeof file.data !== 'string') {
              return send(res, 400, { error: 'Bad file entry.' });
            }
            const target = path.join(dir, file.name);
            if (path.dirname(target) !== dir) return send(res, 400, { error: 'Bad file name.' });
            if (file.encoding === 'base64') fs.writeFileSync(target, Buffer.from(file.data, 'base64'));
            else fs.writeFileSync(target, file.data, 'utf8');
            written.push(path.relative(root, target));
          }
          send(res, 200, { written });
        } catch (error) {
          send(res, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      });
    },
  };
}

// docs/ is ignored by the watcher so saving a shot never triggers a page reload in the middle of a review.
export default defineConfig({ plugins: [shotsPlugin()], server: { watch: { ignored: ['**/docs/**'] } } });
