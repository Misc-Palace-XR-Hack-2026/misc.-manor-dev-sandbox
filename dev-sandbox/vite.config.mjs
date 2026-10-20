import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Pages share one codebase: / is the public demo, /dev/ is the untouched dev sandbox, /about/ is a static page.
// Vite splits the shared code (core/, three.js) into common chunks, so the demo never downloads the sandbox's editor UI.

const page = (path) => fileURLToPath(new URL(path, import.meta.url));

// `/intro` replays the walk-in (it forwards to `/?intro`). `/dev`, `/about` and `/intro` (no trailing slash) would otherwise fall through to the demo's index.html.
function trailingSlashPages() {
  const redirect = (req, res, next) => {
    const url = req.url ?? '';
    const [path, query] = url.split('?');
    if (path === '/dev' || path === '/about' || path === '/intro') {
      res.statusCode = 301;
      res.setHeader('Location', path + '/' + (query ? '?' + query : ''));
      res.end();
      return;
    }
    next();
  };
  return {
    name: 'trailing-slash-pages',
    configureServer: (server) => { server.middlewares.use(redirect); },
    configurePreviewServer: (server) => { server.middlewares.use(redirect); },
  };
}

export default defineConfig({
  plugins: [trailingSlashPages()],
  build: {
    rollupOptions: {
      input: {
        demo: page('index.html'),
        dev: page('dev/index.html'),
        about: page('about/index.html'),
        intro: page('intro/index.html'),
      },
    },
  },
});
