#!/usr/bin/env python3
"""Local Shot 01 editor API + render queue. Bind loopback; expose only via Tailscale Serve.

Render queue: each job freezes a snapshot of the settings at the moment it is queued
(composite/full/queue/<id>.json), so later edits never change a job already in line.
Jobs run one at a time; the queue survives restarts (render_queue.json). A job that was
running when the server stopped is put back to "queued".
"""
from __future__ import annotations
import json, os, re, signal, subprocess, sys, threading, time, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from shot01_edit import CODE, KEYED, CONFIG, ALLOWED, front_arm, validate_person, camera_settings, probe_duration
from shot01_look import GRADE_DEFAULTS, matte as matte_settings

HOST = os.environ.get('SHOT01_HOST', '127.0.0.1'); PORT = int(os.environ.get('SHOT01_PORT', '5191'))
PUBLIC_ORIGIN = os.environ.get('SHOT01_PUBLIC_ORIGIN', 'http://omarchy-1.tail589b59.ts.net:5191')
SCENE_RENDERS = Path(os.environ.get('SCENE_RENDERS_DIR') or KEYED.parent / 'Scene_Renders_4K')
OUT = KEYED / 'composite/full'
QDIR = OUT / 'queue'; QDIR.mkdir(parents=True, exist_ok=True)
QFILE = OUT / 'render_queue.json'
lock = threading.Lock()
wake = threading.Event()
jobs: list[dict] = []
current = {'proc': None, 'id': None}
USER_KEYS = {'x', 'y', 'width', 'angle', 'flip_h', 'flip_v', *GRADE_DEFAULTS}
DURATIONS: dict[str, float] = {}


def validate(cfg):
    if set(cfg['clips']) != ALLOWED: raise ValueError('Only KO6A8423–8429 are permitted')
    p = cfg['person']
    poly = cfg['front_arm_polygon']
    if not 3 <= len(poly) <= 40 or any(len(v) != 2 or not 0 <= float(v[0]) < 1920 or not 0 <= float(v[1]) < 1080 for v in poly):
        raise ValueError('Arm polygon point outside frame')
    c = camera_settings(cfg.get('camera')); cfg['camera'] = {k: c[k] for k in ('name', 'zoom', 'center_x', 'center_y')}
    cfg['back_matte'] = matte_settings(cfg['back_matte'])
    for c in ALLOWED:
        extra = set(cfg['clips'][c].get('person', {})) - USER_KEYS
        if extra: raise ValueError(f'Unsupported per-take keys: {sorted(extra)}')
        entry = dict(p, **cfg['clips'][c].get('person', {}))
        if not -1000 <= float(entry['x']) < 1920 or not -1000 <= float(entry['y']) < 1080: raise ValueError('Placement off-frame')
        validate_person(entry)
    old = json.loads(CONFIG.read_text())
    if p != old['person']: raise ValueError('Global key/crop settings are file-only')
    for key in ('plate', 'animated_plate', 'output_dir'):
        if cfg[key] != old[key]: raise ValueError(f'Cannot change {key} from browser')
    for c in ALLOWED:
        if cfg['clips'][c]['preview_at'] != old['clips'][c]['preview_at']: raise ValueError('Preview time is fixed in browser')


def suffix(name): return 'render' if name == 'wide' else f'render_{name}'


def persist():
    tmp = QFILE.with_suffix('.pending'); tmp.write_text(json.dumps(jobs, indent=1)); tmp.replace(QFILE)


def load_queue():
    global jobs
    if QFILE.exists():
        try: jobs = json.loads(QFILE.read_text())
        except Exception: jobs = []
    for j in jobs:
        if j['status'] == 'running': j.update(status='queued', progress=0)
    persist()


def duration(stem):
    if stem not in DURATIONS: DURATIONS[stem] = probe_duration(KEYED.parent / f'{stem}.MOV')
    return DURATIONS[stem]


def progress_of(log: Path, total: float) -> float:
    try:
        with log.open('rb') as f:
            f.seek(max(0, log.stat().st_size - 4000)); tail = f.read().decode('utf-8', 'ignore')
        m = re.findall(r'time=(\d+):(\d+):([\d.]+)', tail)
        if m: h, mi, s = m[-1]; return min(0.999, (int(h) * 3600 + int(mi) * 60 + float(s)) / total)
    except OSError: pass
    return 0.0


def worker():
    while True:
        with lock:
            job = next((j for j in jobs if j['status'] == 'queued'), None)
            if job: job.update(status='running', started=time.time(), progress=0, error=None); current['id'] = job['id']; persist()
        if not job:
            wake.wait(5); wake.clear(); continue
        snap = QDIR / f"{job['id']}.json"
        log = OUT / f"{job['clip']}_shot01_{suffix(job['pass'])}.log"
        total = duration(job['clip'])
        proc = subprocess.Popen([sys.executable, str(CODE / 'shot01_edit.py'), 'render', job['clip'], '--config', str(snap)],
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, start_new_session=True)
        current['proc'] = proc
        while proc.poll() is None:
            with lock: job['progress'] = progress_of(log, total)
            time.sleep(2)
        out = proc.stdout.read()
        with lock:
            current.update(proc=None, id=None)
            job['finished'] = time.time()
            if job['status'] == 'canceled':
                (OUT / f"{job['clip']}_shot01_{suffix(job['pass'])}.partial.mp4").unlink(missing_ok=True)
            elif proc.returncode == 0:
                target = OUT / f"{job['clip']}_shot01_{suffix(job['pass'])}.mp4"
                job.update(status='done', progress=1, file=target.name, bytes=target.stat().st_size)
            else:
                tail = (out.strip().splitlines() or ['failed'])[-1]
                job.update(status='error', error=tail[-300:])
            persist()


def enqueue(cfg, clips):
    validate(cfg)
    with lock:
        tmp = CONFIG.with_suffix('.json.pending'); tmp.write_text(json.dumps(cfg, indent=2) + '\n'); tmp.replace(CONFIG)
        added = []
        for c in clips:
            jid = time.strftime('%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:4]
            (QDIR / f'{jid}.json').write_text(json.dumps(cfg, indent=2))
            j = {'id': jid, 'clip': c, 'pass': cfg['camera']['name'], 'status': 'queued', 'progress': 0,
                 'created': time.time(), 'duration': duration(c)}
            jobs.append(j); added.append(j)
        persist()
    wake.set()
    return added


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass

    def reply(self, code, body, ctype='application/json', head=False):
        if not isinstance(body, (bytes, str)): body = json.dumps(body)
        if isinstance(body, str): body = body.encode()
        self.send_response(code); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store'); self.end_headers()
        if not head: self.wfile.write(body)

    def media(self, path, head=False, download=None):
        if not path.is_file(): return self.reply(404, 'not found', 'text/plain', head=head)
        size = path.stat().st_size; ctype = 'video/mp4' if path.suffix == '.mp4' else 'image/png'
        match = re.fullmatch(r'bytes=(\d+)-(\d*)', self.headers.get('Range', ''))
        start = int(match[1]) if match else 0; end = min(int(match[2]), size - 1) if match and match[2] else size - 1
        if start >= size or end < start: return self.reply(416, 'invalid range', 'text/plain', head=head)
        count = end - start + 1; self.send_response(206 if match else 200)
        self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(count)); self.send_header('Accept-Ranges', 'bytes')
        if download: self.send_header('Content-Disposition', f'attachment; filename="{download}"')
        if match: self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.end_headers()
        if head: return
        with path.open('rb') as f:
            f.seek(start)
            try:
                while count:
                    chunk = f.read(min(count, 1 << 20))
                    if not chunk: break
                    self.wfile.write(chunk); count -= len(chunk)
            except (BrokenPipeError, ConnectionResetError): pass

    def do_HEAD(self): self.dispatch(True)
    def do_GET(self): self.dispatch(False)

    def dispatch(self, head):
        url = urlparse(self.path); path = url.path
        if path == '/': return self.reply(200, (CODE / 'shot01_editor.html').read_bytes(), 'text/html; charset=utf-8', head=head)
        if path == '/api/config': return self.reply(200, CONFIG.read_bytes(), head=head)
        if path == '/api/queue':
            with lock: return self.reply(200, {'jobs': jobs}, head=head)
        if path == '/media/still-plate': return self.media(KEYED / 'QC/composite/shot01_plate_1080.png', head)
        if path == '/media/plate': return self.media(KEYED / json.loads(CONFIG.read_text())['animated_plate'], head)
        if path.startswith('/media/actor/'):
            stem = path.rsplit('/', 1)[-1]
            if stem not in ALLOWED: return self.reply(404, 'not found', 'text/plain', head=head)
            return self.media(KEYED / 'editor_media' / f'{stem}_proxy.mp4', head)
        if path.startswith('/scene-renders/'):
            name = path.rsplit('/', 1)[-1]
            if not re.fullmatch(r'shot[0-9a-z_]+_4k\.mp4', name): return self.reply(404, 'not found', 'text/plain', head=head)
            return self.media(SCENE_RENDERS / name, head, download=name if 'dl' in parse_qs(url.query) else None)
        if path.startswith('/media/output/'):
            stem = path.rsplit('/', 1)[-1]
            if stem not in ALLOWED: return self.reply(404, 'not found', 'text/plain', head=head)
            name = parse_qs(url.query).get('pass', ['wide'])[0]
            if not re.fullmatch(r'[A-Za-z0-9_-]{1,24}', name): return self.reply(400, 'bad pass', 'text/plain', head=head)
            fn = f'{stem}_shot01_{suffix(name)}.mp4'
            return self.media(OUT / fn, head, download=fn if 'dl' in parse_qs(url.query) else None)
        return self.reply(404, 'not found', 'text/plain', head=head)

    def do_POST(self):
        origin = self.headers.get('Origin', '')
        if origin and not (origin.startswith(f'http://{HOST}:{PORT}') or origin.startswith(PUBLIC_ORIGIN)):
            return self.reply(403, {'error': 'Unexpected origin'})
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json': return self.reply(415, {'error': 'Expected JSON'})
        n = int(self.headers.get('Content-Length', '0'))
        if n > 200000: return self.reply(413, {'error': 'Request too large'})
        try: data = json.loads(self.rfile.read(n))
        except Exception: return self.reply(400, {'error': 'Invalid JSON'})
        try:
            if self.path == '/api/config':
                validate(data)
                with lock:
                    tmp = CONFIG.with_suffix('.json.pending'); tmp.write_text(json.dumps(data, indent=2) + '\n'); tmp.replace(CONFIG)
                return self.reply(200, {'saved': True})
            if self.path == '/api/queue/add':
                clips = data.get('clips') or []
                if not clips or any(c not in ALLOWED for c in clips): raise ValueError('Choose takes from KO6A8423–KO6A8429')
                return self.reply(202, {'added': enqueue(data['config'], list(dict.fromkeys(clips)))})
            if self.path == '/api/queue/cancel':
                jid = data.get('id')
                with lock:
                    j = next((j for j in jobs if j['id'] == jid), None)
                    if not j: raise ValueError('No such job')
                    if j['status'] == 'queued': j['status'] = 'canceled'
                    elif j['status'] == 'running' and current['id'] == jid and current['proc']:
                        j['status'] = 'canceled'; os.killpg(current['proc'].pid, signal.SIGTERM)
                    persist()
                return self.reply(200, {'ok': True})
            if self.path == '/api/queue/clear':
                with lock:
                    jobs[:] = [j for j in jobs if j['status'] in ('queued', 'running')]; persist()
                return self.reply(200, {'ok': True})
            if self.path == '/api/queue/retry':
                with lock:
                    j = next((j for j in jobs if j['id'] == data.get('id')), None)
                    if not j or j['status'] not in ('error', 'canceled'): raise ValueError('Only failed or canceled jobs can be retried')
                    j.update(status='queued', progress=0, error=None); persist()
                wake.set(); return self.reply(200, {'ok': True})
        except (ValueError, KeyError, TypeError) as e:
            return self.reply(400, {'error': str(e)})
        return self.reply(404, 'not found', 'text/plain')


if __name__ == '__main__':
    load_queue()
    threading.Thread(target=worker, daemon=True).start()
    print(f'EDITOR http://{HOST}:{PORT}/', flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
