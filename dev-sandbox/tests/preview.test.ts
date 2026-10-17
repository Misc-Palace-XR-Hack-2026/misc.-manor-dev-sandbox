import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPreview, embedFor, youtubeId } from '../src/core/preview';
import { createEmbedFrame } from '../src/views/preview-card';
import type { ContentItem } from '../src/core/types';

// 1x1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const item = (over: Partial<ContentItem>): ContentItem => ({
  id: 'c1', type: 'link', title: 'Title', sourceKind: 'url', sourceRef: 'https://example.com/a', tags: [], createdAt: '2026-01-01', ...over,
});
const urlItem = (sourceRef: string, type: ContentItem['type'] = 'link') => item({ sourceRef, type });

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
    'ftp://dvgpro.com/', 'javascript://dvgpro.com/', 'https://dvgpro.com.evil.example/',
    'https://other-user.github.io/', 'https://127.0.0.1/', 'https://localhost/',
  ]) assert.equal(embedFor(new URL(ref)), null, ref);
});

test('page previews preserve the exact HTTPS destination including www and hash', () => {
  assert.equal(embedFor(new URL('https://www.dvgpro.com/a?q=1#part'))?.src, 'https://www.dvgpro.com/a?q=1#part');
});
if (!globalThis.document) {
  globalThis.document = {
    createElement: (tag: string) => {
      const attrs: Record<string, string> = {};
      const el = {
        tagName: tag.toUpperCase(),
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
  assert.equal(buildPreview(urlItem('https://cdn.example.com/cat.jpg', 'link')).kind, 'card');
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

  assert.equal(embedFor(new URL('http://en.wikipedia.org/wiki/Cat#History'))?.src, 'https://en.wikipedia.org/wiki/Cat', 'upgrades to https, drops hash');
  assert.equal(embedFor(new URL('https://en.wikipedia.org/w/index.php?title=Cat')), null);
});

test('confirmed framable sites embed the page itself; lookalikes do not', () => {
  const p = buildPreview(urlItem('https://www.gungo.dev/projects?x=1#top'));
  assert.deepEqual(p, { kind: 'embed', title: 'Title', provider: 'page', height: 220, src: 'https://www.gungo.dev/projects?x=1#top' });
  assert.equal(buildPreview(urlItem('gungo.dev')).kind, 'embed', 'bare hostname');
  assert.equal(buildPreview(urlItem('https://gungo.dev.evil.example/')).kind, 'card');
  assert.equal(buildPreview(urlItem('https://notgungo.dev/')).kind, 'card');
});

test('sites that block framing never get an iframe; they fall back to a card', () => {
  for (const ref of ['https://github.com/a/b', 'https://developer.mozilla.org/en-US/', 'https://news.ycombinator.com/', 'https://example.com/a']) {
    assert.equal(buildPreview(urlItem(ref)).kind, 'card', ref);
  }
});

test('lookalike hosts do not match an embed provider', () => {
  for (const ref of [
    'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ', 'https://evil.example/https://youtu.be/dQw4w9WgXcQ',
    'https://wikipedia.org.evil.example/wiki/Cat', 'https://notvimeo.com/76979871', 'https://open.spotify.com.evil.example/track/4uLU6hMCjMI75M1A2tKUQC',
  ]) assert.equal(embedFor(new URL(ref)), null, ref);
});

test('embeds only ever point at https on the provider hosts', () => {
  const allowed = /^https:\/\/(www\.youtube-nocookie\.com|player\.vimeo\.com|open\.spotify\.com|w\.soundcloud\.com|[a-z-]+\.wikipedia\.org)\//;
  for (const ref of [
    'https://youtu.be/dQw4w9WgXcQ', 'https://vimeo.com/76979871', 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
    'https://soundcloud.com/a/b', 'http://de.wikipedia.org/wiki/Katze',
  ]) assert.match(embedFor(new URL(ref))!.src, allowed, ref);
});

test('plain links get a favicon + domain card, without www; bare hostnames work too', () => {
  const p = buildPreview(urlItem('https://www.example.com/path?q=1'));
  assert.equal(p.kind, 'card');
  if (p.kind !== 'card') return;
  assert.equal(p.domain, 'example.com');
  assert.equal(p.faviconSrc, 'https://www.example.com/favicon.ico');
  const bare = buildPreview(urlItem('example.com/x'));
  assert.equal(bare.kind === 'card' && bare.domain, 'example.com');
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
  assert.equal(frame.src, preview.src);
  assert.equal(frame.getAttribute('sandbox'), 'allow-scripts allow-same-origin allow-presentation allow-popups');
  assert.equal(frame.allow, 'encrypted-media; picture-in-picture; fullscreen');
  assert.equal(frame.referrerPolicy, 'strict-origin-when-cross-origin');
  assert.equal(frame.title, 'Preview of Title');
});

test('notes show an excerpt; files show their stored name', () => {
  const long = 'x'.repeat(500);
  const note = buildPreview(item({ type: 'note', sourceKind: 'note', sourceRef: long }));
  assert.equal(note.kind === 'note' && note.text.length, 241);
  assert.deepEqual(buildPreview(item({ type: 'file', sourceKind: 'file', sourceRef: 'docs/a.pdf' })),
    { kind: 'card', title: 'Title', type: 'file', detail: 'docs/a.pdf' });
});
