import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPreview, embedFor, youtubeId } from '../src/core/preview';
import * as previewPolicy from '../src/core/preview';
import { createEmbedFrame } from '../src/views/preview-card';
import type { ContentItem } from '../src/core/types';

// 1x1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const item = (over: Partial<ContentItem>): ContentItem => ({
  id: 'c1', type: 'link', title: 'Title', sourceKind: 'url', sourceRef: 'https://example.com/a', tags: [], createdAt: '2026-01-01', ...over,
});
const urlItem = (sourceRef: string, type: ContentItem['type'] = 'link') => item({ sourceRef, type });

test('unknown public HTTPS pages are eligible, without implying render success', () => {
  const url = new URL('https://www.example.com/path?q=1#part');
  assert.deepEqual(embedFor(url), { provider: 'page', src: url.href, height: 220 });
});

test('Matt’s own HTTPS websites get page previews rather than cards', () => {
  for (const ref of [
    'Https://dvgpro.com', 'https://davisclockservices.com/',
    'https://apolloslearningcorner.com', 'https://apolloslearningcorner.com/Games/',
    'https://thescoobmeisterm.github.io/novation-bs2-worship-ambient/index.html',
    'https://thescoobmeisterm.github.io/TinkerWorkbench/',
    'https://thescoobmeisterm.github.io/SparkTinkerGame/',
    'https://theplutollc.com/', 'https://os.dvgpro.com/',
  ]) {
    const p = buildPreview(urlItem(ref));
    assert.equal(p.kind, 'embed', ref);
    assert.equal(p.kind === 'embed' && p.provider, 'page');
  }
});

test('page previews reject insecure, credentialed, nonstandard-port and lookalike URLs', () => {
  for (const ref of [
    'http://dvgpro.com/', 'https://user:password@dvgpro.com/', 'https://dvgpro.com:8443/',
    'ftp://dvgpro.com/', 'javascript://dvgpro.com/', 
     'https://127.0.0.1/', 'https://localhost/',
  ]) assert.equal(embedFor(new URL(ref)), null, ref);
});

test('page previews preserve the exact HTTPS destination including www and hash', () => {
  assert.equal(embedFor(new URL('https://www.dvgpro.com/a?q=1#part'))?.src, 'https://www.dvgpro.com/a?q=1#part');
});
if (!globalThis.document) {
  globalThis.window = new EventTarget() as unknown as Window & typeof globalThis;
  globalThis.location = new URL('https://palace.example') as unknown as Location;
  globalThis.MutationObserver = class { observe() {} } as unknown as typeof MutationObserver;
  globalThis.document = {
    createElement: (tag: string) => {
      const attrs: Record<string, string> = {};
      const el = {
        tagName: tag.toUpperCase(),
        addEventListener() {},
        removeEventListener() {},
        className: '',
        src: '',
        title: '',
        height: '',
        allow: '',
        allowFullscreen: false,
        referrerPolicy: '',
        setAttribute: (name: string, value: string) => { attrs[name] = value; },
        getAttribute: (name: string) => attrs[name] ?? null,
      };
      return el;
    },
  } as unknown as Document;
}

test('local photo previews as an image thumbnail', () => {
  const p = buildPreview(item({ type: 'image', sourceKind: 'file', sourceRef: 'me.png', imageData: PNG }));
  assert.deepEqual(p, { kind: 'image', title: 'Title', src: PNG });
});

test('an invalid imageData is never used as an image src', () => {
  const p = buildPreview(item({ sourceKind: 'file', sourceRef: 'x.png', imageData: 'javascript:alert(1)' }));
  assert.equal(p.kind, 'card');
});

test('direct image URLs preview as the image; non-image types do not', () => {
  const p = buildPreview(urlItem('https://cdn.example.com/a/cat.jpg?w=2', 'image'));
  assert.deepEqual(p, { kind: 'image', title: 'Title', src: 'https://cdn.example.com/a/cat.jpg?w=2' });
  assert.equal(buildPreview(urlItem('https://cdn.example.com/cat.jpg', 'link')).kind, 'embed');
});

test('YouTube URLs embed the privacy-enhanced player', () => {
  for (const ref of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'https://youtu.be/dQw4w9WgXcQ',
    'https://youtube.com/shorts/dQw4w9WgXcQ', 'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
  ]) {
    const p = buildPreview(urlItem(ref, 'video'));
    assert.deepEqual(p, { kind: 'embed', title: 'Title', provider: 'youtube', height: 169, src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' }, ref);
  }
  assert.equal(youtubeId(new URL('https://www.youtube.com/watch?v=../../x')), null);
  assert.equal(youtubeId(new URL('https://example.com/watch?v=dQw4w9WgXcQ')), null);
  assert.equal(buildPreview(urlItem('https://www.youtube.com/@somechannel', 'video')).kind, 'card', 'channel pages are not videos');
});

test('Vimeo, Spotify, SoundCloud and Wikipedia get embeds', () => {
  assert.equal(embedFor(new URL('https://vimeo.com/76979871'))?.src, 'https://player.vimeo.com/video/76979871');
  assert.equal(embedFor(new URL('https://vimeo.com/channels/staffpicks/76979871'))?.src, 'https://player.vimeo.com/video/76979871');
  assert.equal(embedFor(new URL('https://vimeo.com/about')), null);

  assert.equal(embedFor(new URL('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc'))?.src,
    'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC');
  assert.equal(embedFor(new URL('https://open.spotify.com/intl-de/album/4uLU6hMCjMI75M1A2tKUQC'))?.provider, 'spotify');
  assert.equal(embedFor(new URL('https://open.spotify.com/track/short')), null);

  const sc = embedFor(new URL('https://soundcloud.com/forss/flickermood?utm=x'));
  assert.equal(sc?.src, 'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fforss%2Fflickermood&visual=false');
  assert.equal(embedFor(new URL('https://soundcloud.com/forss')), null, 'profile page, not a track');

  assert.equal(embedFor(new URL('https://en.wikipedia.org/wiki/Cat#History'))?.src, 'https://en.wikipedia.org/wiki/Cat', 'drops hash');
  assert.equal(embedFor(new URL('https://en.wikipedia.org/w/index.php?title=Cat')), null);
});

test('ordinary public hosts embed as pages, never as impersonated providers', () => {
  const p = buildPreview(urlItem('https://www.gungo.dev/projects?x=1#top'));
  assert.deepEqual(p, { kind: 'embed', title: 'Title', provider: 'page', height: 220, src: 'https://www.gungo.dev/projects?x=1#top' });
  assert.equal(buildPreview(urlItem('gungo.dev')).kind, 'embed', 'bare hostname');
  assert.equal(buildPreview(urlItem('https://gungo.dev.evil.example/')).kind, 'embed');
  assert.equal(buildPreview(urlItem('https://notgungo.dev/')).kind, 'embed');
});

test('sites that block framing never get an iframe; they fall back to a card', () => {
  for (const ref of ['https://github.com/a/b', 'https://developer.mozilla.org/en-US/', 'https://news.ycombinator.com/']) {
    assert.equal(buildPreview(urlItem(ref)).kind, 'card', ref);
  }
});

test('lookalike hosts do not match an embed provider', () => {
  for (const ref of [
    'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ', 'https://evil.example/https://youtu.be/dQw4w9WgXcQ',
    'https://wikipedia.org.evil.example/wiki/Cat', 'https://notvimeo.com/76979871', 'https://open.spotify.com.evil.example/track/4uLU6hMCjMI75M1A2tKUQC',
  ]) assert.equal(embedFor(new URL(ref))?.provider, 'page', ref);
});

test('embeds only ever point at https on the provider hosts', () => {
  const allowed = /^https:\/\/(www\.youtube-nocookie\.com|player\.vimeo\.com|open\.spotify\.com|w\.soundcloud\.com|[a-z-]+\.wikipedia\.org)\//;
  for (const ref of [
    'https://youtu.be/dQw4w9WgXcQ', 'https://vimeo.com/76979871', 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
    'https://soundcloud.com/a/b', 'https://de.wikipedia.org/wiki/Katze',
  ]) assert.match(embedFor(new URL(ref))!.src, allowed, ref);
});

test('blocked links get a favicon + domain card, without www; bare hostnames work too', () => {
  const p = buildPreview(urlItem('https://www.github.com/path?q=1'));
  assert.equal(p.kind, 'card');
  if (p.kind !== 'card') return;
  assert.equal(p.domain, 'github.com');
  assert.equal(p.faviconSrc, 'https://www.github.com/favicon.ico');
  const bare = buildPreview(urlItem('github.com/x'));
  assert.equal(bare.kind === 'card' && bare.domain, 'github.com');
});

test('unsafe URL schemes become a plain card with no favicon or embed', () => {
  for (const ref of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd']) {
    const p = buildPreview(urlItem(ref));
    assert.equal(p.kind, 'card', ref);
    assert.equal(p.kind === 'card' && p.faviconSrc, undefined, ref);
  }
});

test('desktop and VR embed iframes share the same sandbox, src and player permissions', () => {
  const preview = buildPreview(urlItem('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'video'));
  assert.equal(preview.kind, 'embed');
  if (preview.kind !== 'embed') return;
  const frame = createEmbedFrame(preview);
  assert.equal(frame.tagName, 'IFRAME');
  assert.equal(frame.className, 'preview-iframe');
  const src = new URL(frame.src);
  assert.equal(src.origin + src.pathname, preview.src);
  assert.equal(src.searchParams.get('enablejsapi'), '1');
  assert.equal(src.searchParams.get('origin'), location.origin);
  assert.equal(frame.getAttribute('sandbox'), 'allow-scripts allow-same-origin allow-presentation allow-popups');
  assert.equal(frame.allow, 'encrypted-media; picture-in-picture; fullscreen');
  assert.equal(frame.referrerPolicy, 'strict-origin-when-cross-origin');
  assert.equal(frame.title, 'Preview of Title');
});

test('public preview eligibility rejects nonpublic and ambiguous authorities before any remote image or favicon', () => {
  for (const host of ['localhost', 'sub.localhost', 'printer', 'home.local', 'router.internal', 'box.home.arpa',
    '127.0.0.1', '127.1', '2130706433', '0x7f000001', '0177.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1',
    '169.254.169.254', '100.64.0.1', '0.0.0.0', '[::1]', '[::]', '[fc00::1]', '[fe80::1]',
    '[::ffff:127.0.0.1]', '[::ffff:7f00:1]', '[2001:4860:4860::8888]', '8.8.8.8']) {
    const ref = `https://${host}/image.png`;
    assert.equal(embedFor(new URL(ref)), null, ref);
    const p = buildPreview(urlItem(ref, 'image'));
    assert.equal(p.kind, 'card', ref);
    assert.equal(p.kind === 'card' && p.faviconSrc, undefined, ref);
  }
  for (const ref of ['http://youtube.com/watch?v=dQw4w9WgXcQ', 'https://u:p@example.com/', 'https://example.com:8443/']) {
    assert.equal(embedFor(new URL(ref)), null, ref);
    const p = buildPreview(urlItem(ref));
    assert.equal(p.kind === 'card' && p.faviconSrc, undefined, ref);
  }
});

test('blocklist uses canonical exact/subdomain boundaries; provider profiles stay cards', () => {
  for (const host of ['github.com', 'www.github.com', 'a.github.com', 'GITHUB.COM.', 'youtube.com', 'youtube-nocookie.com', 'vimeo.com', 'player.vimeo.com', 'open.spotify.com', 'soundcloud.com', 'w.soundcloud.com', 'en.wikipedia.org', 'hyperfollow.com', 'distrokid.com', 'amazon.com']) {
    assert.equal(embedFor(new URL(`https://${host}/profile`)), null, host);
  }
  for (const host of ['notgithub.com', 'github.com.example.com', 'other-user.github.io']) {
    assert.equal(embedFor(new URL(`https://${host}/`))?.provider, 'page', host);
  }
});

test('short-link aliases of blocked destinations are blocked too', () => {
  // amzn.to redirects into amazon.com, which refuses framing. Blocking only the long host would
  // let the recorded refusal through as a wasted frame attempt (see web-previews.md evidence).
  for (const ref of ['https://amzn.to/3Snypsv', 'https://a.co/d/abc', 'https://youtu.be/dQw4w9WgXcQ?list=x']) {
    const p = buildPreview(urlItem(ref));
    if (ref.includes('youtu.be')) {
      assert.equal(p.kind, 'embed', ref); // official player, not a generic page frame
      assert.equal(p.kind === 'embed' && p.provider, 'youtube');
    } else {
      assert.equal(p.kind, 'card', ref);
      assert.equal(p.kind === 'card' && p.openHref, ref, ref);
    }
  }
});

test('same-origin sources cannot become frames or automatic image/favicon requests', () => {
  const original = globalThis.location;
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'https://palace.example.com' } });
  try {
    const ref = 'https://palace.example.com/image.png';
    assert.equal(embedFor(new URL(ref)), null);
    const p = buildPreview(urlItem(ref, 'image'));
    assert.equal(p.kind, 'card');
    assert.equal(p.kind === 'card' && p.faviconSrc, undefined);
  } finally { Object.defineProperty(globalThis, 'location', { configurable: true, value: original }); }
});

test('frame builder rechecks URL eligibility even for directly supplied previews', () => {
  for (const src of ['https://127.1/', 'https://user:pass@example.com/', 'https://example.com:8443/', 'http://example.com/']) {
    const frame = createEmbedFrame({ kind: 'embed', provider: 'page', src, title: 'Unsafe', height: 220 });
    assert.equal(frame.src, '', src);
  }
});

test('explicit Open is a user handoff: wider than frame eligibility, but never replays credentials', () => {
  assert.equal(typeof previewPolicy.previewOpenUrl, 'function');
  // A click hands the address to the user's own browser. Frame-eligibility limits (HTTP, blocklist,
  // ports, private hosts, same origin) exist to stop AUTOMATIC loads, not to hide a saved link.
  for (const ref of [
    'https://github.com/a', 'http://example.com/a', 'https://youtube.com/@channel',
    'https://example.com:8443/', 'http://localhost:3000/', 'https://192.168.1.5/admin',
    'https://[::1]/', 'http://127.0.0.1/x',
  ]) assert.equal(previewPolicy.previewOpenUrl(ref), ref, ref);
  // Unsafe schemes and embedded credentials stay refused: we must not navigate to script URLs
  // or hand another party's basic-auth secret to a new tab.
  for (const ref of ['javascript:alert(1)', 'data:text/html,<b>x', 'file:///etc/passwd', 'https://u:p@example.com/', 'https://u@example.com/']) {
    assert.equal(previewPolicy.previewOpenUrl(ref), null, ref);
  }
});

test('blocked, insecure and ineligible previews still carry an external-open target', () => {
  for (const ref of [
    'https://github.com/a/b', 'https://youtube.com/@channel', 'https://distrokid.com/hyperfollow/x',
    'http://example.com/', 'https://example.com:8443/x', 'https://127.0.0.1/x', 'https://router.internal/',
  ]) {
    const p = buildPreview(urlItem(ref));
    assert.equal(p.kind, 'card', ref);
    assert.equal(p.kind === 'card' && p.openHref, ref, ref);
  }
  // Nothing unsafe ever becomes an href, and a note/file card has nothing to open.
  for (const ref of ['javascript:alert(1)', 'https://u:p@example.com/']) {
    const p = buildPreview(urlItem(ref));
    assert.equal(p.kind === 'card' && p.openHref, undefined, ref);
  }
  assert.equal(buildPreview(item({ type: 'file', sourceKind: 'file', sourceRef: 'a.pdf' })).kind === 'card'
    && (buildPreview(item({ type: 'file', sourceKind: 'file', sourceRef: 'a.pdf' })) as { openHref?: string }).openHref, undefined);
});

test('notes show an excerpt; files show their stored name', () => {
  const long = 'x'.repeat(500);
  const note = buildPreview(item({ type: 'note', sourceKind: 'note', sourceRef: long }));
  assert.equal(note.kind === 'note' && note.text.length, 241);
  assert.deepEqual(buildPreview(item({ type: 'file', sourceKind: 'file', sourceRef: 'docs/a.pdf' })),
    { kind: 'card', title: 'Title', type: 'file', detail: 'docs/a.pdf' });
});
