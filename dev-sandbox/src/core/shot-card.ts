import type { CameraState } from './scenes';

// A shot card turns the scene's camera and chair into numbers a person can use on shoot day: where the tripod goes,
// how high, how it is tilted, where the chair stands and how far it is turned, and where to sit.
//
// Real-life coordinates ("shoot coordinates", in meters), as seen standing in the room FACING the fireplace wall:
//   X = to the right of the fireplace centerline   Z = out from the wall   Y = up from the floor
// The sandbox is a stylised room, so one sandbox unit is mapped to REAL_M_PER_UNIT meters. That number comes from the
// armchair, which is 0.72 units wide here (x1.6 scene scale = 1.15 units) and about 0.65 m wide as a normal armchair.

export const REAL_M_PER_UNIT = 0.55;
const CHAIR_WIDTH_M = 0.65;
const SEAT_HEIGHT_M = 0.42;
const SEATED_EYE_HEIGHT_M = 1.2; // from the floor, seated
const TRIPOD_MAX_M = 2.0; // above this you need a ladder or a high stand
const SENSOR_HEIGHT_MM = 24; // full-frame equivalent focal lengths

const ISO_ELEVATION = Math.atan2(14, Math.hypot(14, 14));
const HEIGHT_UNIT = Math.PI / 6;
const DEG = 180 / Math.PI;

export const LENSES_MM = [35, 50, 85, 135] as const;
export const PRIMARY_LENS_MM = 85;

export interface ShotCardInput {
  shotNumber: string; // "01"
  shotId: string; // storyboard id, e.g. "1"
  title: string;
  sceneName: string;
  type: string;
  durationSec: number;
  notes: string;
  capturedAt: string;
  resolution: string;
  layer: string;
  vignette: number;
  camera: CameraState;
  endCamera: CameraState | null;
  /** The point the camera looks at, in sandbox world units. */
  target: [number, number, number];
  /** Sandbox world units visible top to bottom inside the 16:9 frame at zoom 1. */
  frameWorldHeight: number;
  chair: { pos: [number, number, number]; rotationY: number } | null;
  /** Fireplace back-center on the floor (world units). The shoot coordinates are measured from it. */
  origin: { x: number; z: number; hasFireplace: boolean };
  imageFile: string;
}

export interface CameraRig {
  lensMm: number;
  distanceM: number; // camera to the look-at point
  position: { x: number; y: number; z: number }; // shoot coordinates
  tiltDownDeg: number;
  /** Direction the camera faces on the floor plane, degrees, same convention as chair headings. */
  headingDeg: number;
  hFovDeg: number;
  heightOk: boolean;
}

export interface ShotNumbers {
  main: CameraRig;
  lenses: CameraRig[];
  end: CameraRig | null;
  lookAt: { x: number; y: number; z: number };
  chair: null | {
    x: number; z: number;
    turnDeg: number; // signed, + = turned to the sitter's left (counter-clockwise seen from above)
    facingText: string;
    rotationYDeg: number;
  };
  cameraFromChair: null | { distanceM: number; offAxisDeg: number; text: string };
  suggestion: string | null;
}

const norm180 = (d: number): number => ((((d + 180) % 360) + 360) % 360) - 180;
const f = (n: number, digits = 2): string => (Math.abs(n) < 0.005 ? 0 : n).toFixed(digits);

function leftRight(x: number, left = 'left', right = 'right'): string {
  return x < 0 ? left : right;
}

export function cameraRig(input: ShotCardInput, cam: CameraState, lensMm: number): CameraRig {
  const k = REAL_M_PER_UNIT;
  const visibleM = (input.frameWorldHeight / cam.zoom) * k; // meters top to bottom at the subject
  const distanceM = (visibleM * lensMm) / SENSOR_HEIGHT_MM;
  const az = (cam.orbitAngle * Math.PI) / 180;
  const el = Math.min(Math.PI / 2 - 0.02, Math.max(0.03, ISO_ELEVATION + cam.orbitHeight * HEIGHT_UNIT));
  const dir = { x: Math.cos(el) * Math.sin(az), y: Math.sin(el), z: Math.cos(el) * Math.cos(az) };
  const position = {
    x: (input.target[0] - input.origin.x) * k + distanceM * dir.x,
    y: input.target[1] * k + distanceM * dir.y,
    z: (input.target[2] - input.origin.z) * k + distanceM * dir.z,
  };
  const vfov = 2 * Math.atan(SENSOR_HEIGHT_MM / 2 / lensMm);
  return {
    lensMm,
    distanceM,
    position,
    tiltDownDeg: el * DEG,
    headingDeg: norm180(cam.orbitAngle + 180),
    hFovDeg: 2 * Math.atan(Math.tan(vfov / 2) * (16 / 9)) * DEG,
    heightOk: position.y <= TRIPOD_MAX_M,
  };
}

export function computeShotNumbers(input: ShotCardInput): ShotNumbers {
  const k = REAL_M_PER_UNIT;
  const main = cameraRig(input, input.camera, PRIMARY_LENS_MM);
  const lookAt = {
    x: (input.target[0] - input.origin.x) * k,
    y: input.target[1] * k,
    z: (input.target[2] - input.origin.z) * k,
  };

  let chair: ShotNumbers['chair'] = null;
  let cameraFromChair: ShotNumbers['cameraFromChair'] = null;
  if (input.chair) {
    const x = (input.chair.pos[0] - input.origin.x) * k;
    const z = (input.chair.pos[2] - input.origin.z) * k;
    const rDeg = input.chair.rotationY * DEG;
    // Squarely facing the wall is rotationY = 180 degrees (the chair faces (sin r, cos r), the wall is at -z).
    const turnDeg = norm180(rDeg - 180);
    // Positive rotationY is counter-clockwise seen from above, which is the sitter's left when they face the wall.
    const facingText = Math.abs(turnDeg) < 1
      ? 'squarely facing the fireplace wall'
      : `turned ${f(Math.abs(turnDeg), 0)} deg to the ${turnDeg > 0 ? 'left' : 'right'} of squarely facing the fireplace`
        + ` (${turnDeg > 0 ? 'counter-clockwise' : 'clockwise'} seen from above)`;
    chair = { x, z, turnDeg, facingText, rotationYDeg: rDeg };

    const vx = main.position.x - x;
    const vz = main.position.z - z;
    const distanceM = Math.hypot(vx, vz);
    const offAxisDeg = norm180(Math.atan2(vx, vz) * DEG - rDeg); // 0 = straight in front of the chair; + = sitter's left
    cameraFromChair = {
      distanceM,
      offAxisDeg,
      text: Math.abs(offAxisDeg) < 3
        ? 'straight in front of the chair'
        : `${f(Math.abs(offAxisDeg), 0)} deg to the sitter's ${offAxisDeg > 0 ? 'left' : 'right'} of straight in front of the chair`
          + (Math.abs(offAxisDeg) > 135 ? ' (behind the chair)' : ''),
    };
  }

  let suggestion: string | null = null;
  if (!main.heightOk) {
    // Tilt that would put the camera at a tripod-friendly 1.6 m with this lens, keeping the same distance.
    const want = Math.asin(Math.max(-1, Math.min(1, (1.6 - lookAt.y) / main.distanceM)));
    suggestion = `At ${f(main.position.y, 1)} m this camera is above a normal tripod (about ${TRIPOD_MAX_M} m): it needs a ladder or a high stand. `
      + `To shoot from about 1.6 m instead, lower the Tilt slider to about ${f((want - ISO_ELEVATION) / HEIGHT_UNIT, 2)} (${f(want * DEG, 0)} deg down) and shoot again.`;
  }

  return {
    main,
    lenses: LENSES_MM.map((mm) => cameraRig(input, input.camera, mm)),
    end: input.endCamera ? cameraRig(input, input.endCamera, PRIMARY_LENS_MM) : null,
    lookAt,
    chair,
    cameraFromChair,
    suggestion,
  };
}

// ---- diagrams -------------------------------------------------------------------------------------------------

const INK = '#2b2118';
const PAPER = '#fbf5ea';
const GRID = '#e3d6bd';
const ACCENT = '#c4571d';
const BLUE = '#1f7fa6';

function svgWrap(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(width, 0)}" height="${f(height, 0)}" viewBox="0 0 ${f(width, 0)} ${f(height, 0)}" font-family="Helvetica, Arial, sans-serif" font-size="12">`
    + `<rect width="100%" height="100%" fill="${PAPER}"/>${body}</svg>`;
}

/** Top-down diagram: the fireplace wall at the top, chair, sitter and camera (with its field of view) to scale. */
export function topDownSvg(input: ShotCardInput, n: ShotNumbers): string {
  const cam = n.main.position;
  const pts: [number, number][] = [[-0.8, 0], [0.8, 0], [cam.x, cam.z], [n.lookAt.x, n.lookAt.z]];
  if (n.chair) pts.push([n.chair.x, n.chair.z]);
  if (n.end) pts.push([n.end.position.x, n.end.position.z]);
  const pad = 1;
  const minX = Math.floor(Math.min(...pts.map((p) => p[0])) - pad);
  const maxX = Math.ceil(Math.max(...pts.map((p) => p[0])) + pad);
  const maxZ = Math.ceil(Math.max(...pts.map((p) => p[1])) + pad);
  const minZ = -1;
  const px = Math.max(40, Math.min(90, 900 / (maxX - minX))); // pixels per meter
  const W = (maxX - minX) * px;
  const H = (maxZ - minZ) * px + 30;
  const X = (x: number): number => (x - minX) * px;
  const Z = (z: number): number => (z - minZ) * px;

  let s = '';
  for (let x = minX; x <= maxX; x++) {
    s += `<line x1="${X(x)}" y1="0" x2="${X(x)}" y2="${H - 30}" stroke="${GRID}"/>`;
    s += `<text x="${X(x) + 3}" y="${H - 16}" fill="#8a7a5c">${x} m</text>`;
  }
  for (let z = minZ; z <= maxZ; z++) {
    s += `<line x1="0" y1="${Z(z)}" x2="${W}" y2="${Z(z)}" stroke="${GRID}"/>`;
    if (z > 0) s += `<text x="3" y="${Z(z) - 3}" fill="#8a7a5c">${z} m</text>`;
  }
  // Wall and fireplace.
  s += `<rect x="0" y="${Z(-0.3)}" width="${W}" height="${0.3 * px}" fill="#8f7f66"/>`;
  s += `<text x="${X(minX) + 8}" y="${Z(-0.3) - 6}" fill="${INK}" font-weight="bold">FIREPLACE WALL${input.origin.hasFireplace ? '' : ' (no fireplace in this room; X=0 is the default spot)'}</text>`;
  s += `<rect x="${X(-0.55)}" y="${Z(0)}" width="${1.1 * px}" height="${0.33 * px}" fill="#b5532f" stroke="${INK}"/>`;
  s += `<text x="${X(0)}" y="${Z(0.33) + 14}" text-anchor="middle" fill="${INK}">fireplace</text>`;

  // Camera field of view and the line to what it looks at.
  const hdg = (n.main.headingDeg * Math.PI) / 180; // direction the camera faces, (sin, cos) on (x, z)
  const half = (n.main.hFovDeg / 2) * (Math.PI / 180);
  const reach = Math.hypot(cam.x - n.lookAt.x, cam.z - n.lookAt.z) * 1.15 + 0.3;
  const ray = (a: number): string => `${X(cam.x + Math.sin(a) * reach)},${Z(cam.z + Math.cos(a) * reach)}`;
  s += `<polygon points="${X(cam.x)},${Z(cam.z)} ${ray(hdg - half)} ${ray(hdg + half)}" fill="${BLUE}" fill-opacity="0.12" stroke="${BLUE}" stroke-dasharray="5 4"/>`;
  s += `<line x1="${X(cam.x)}" y1="${Z(cam.z)}" x2="${X(n.lookAt.x)}" y2="${Z(n.lookAt.z)}" stroke="${BLUE}"/>`;
  s += `<circle cx="${X(n.lookAt.x)}" cy="${Z(n.lookAt.z)}" r="4" fill="${BLUE}"/>`;

  // Chair, sitter and the turn arrow.
  if (n.chair) {
    const c = n.chair;
    const w = CHAIR_WIDTH_M * px;
    s += `<g transform="translate(${X(c.x)} ${Z(c.z)}) rotate(${f(-c.rotationYDeg, 1)})">`
      + `<rect x="${-w / 2}" y="${-w / 2}" width="${w}" height="${w}" rx="4" fill="#d9b48a" stroke="${INK}" stroke-width="1.5"/>`
      + `<rect x="${-w / 2}" y="${-w / 2}" width="${w}" height="${w * 0.2}" fill="#b98d5d" stroke="${INK}"/>`
      + `<ellipse cx="0" cy="${-w * 0.05}" rx="${w * 0.3}" ry="${w * 0.2}" fill="${ACCENT}" fill-opacity="0.45" stroke="${ACCENT}"/>`
      + `<line x1="0" y1="${w * 0.15}" x2="0" y2="${w * 0.9}" stroke="${ACCENT}" stroke-width="2.5"/>`
      + `<polygon points="${-6},${w * 0.9} ${6},${w * 0.9} 0,${w * 0.9 + 11}" fill="${ACCENT}"/>`
      + `</g>`;
    s += `<text x="${X(c.x) + w * 0.75}" y="${Z(c.z) - w * 0.4}" fill="${ACCENT}" font-weight="bold">chair + sitter</text>`;
    // Distance out from the wall, and sideways from the fireplace centerline.
    s += `<line x1="${X(c.x) + w * 0.62}" y1="${Z(0)}" x2="${X(c.x) + w * 0.62}" y2="${Z(c.z)}" stroke="${INK}" stroke-dasharray="3 3"/>`;
    s += `<text x="${X(c.x) + w * 0.68}" y="${Z(c.z / 2)}" fill="${INK}">${f(c.z)} m</text>`;
    s += `<line x1="${X(0)}" y1="${Z(c.z) + w * 0.62}" x2="${X(c.x)}" y2="${Z(c.z) + w * 0.62}" stroke="${INK}" stroke-dasharray="3 3"/>`;
    s += `<text x="${X(c.x / 2)}" y="${Z(c.z) + w * 0.62 + 14}" fill="${INK}" text-anchor="middle">${f(Math.abs(c.x))} m ${leftRight(c.x)}</text>`;
  }

  // Camera body, pointing where it looks.
  s += `<g transform="translate(${X(cam.x)} ${Z(cam.z)}) rotate(${f(-n.main.headingDeg, 1)})">`
    + `<rect x="-11" y="-9" width="22" height="18" rx="3" fill="${BLUE}" stroke="${INK}"/>`
    + `<polygon points="-6,9 6,9 4,19 -4,19" fill="${INK}"/></g>`;
  s += `<text x="${X(cam.x) + 16}" y="${Z(cam.z) - 8}" fill="${BLUE}" font-weight="bold">camera</text>`;
  s += `<text x="${X(cam.x) + 16}" y="${Z(cam.z) + 7}" fill="${BLUE}">${f(cam.y)} m high, ${f(n.main.tiltDownDeg, 0)} deg down</text>`;
  if (n.end) {
    const e = n.end.position;
    s += `<line x1="${X(cam.x)}" y1="${Z(cam.z)}" x2="${X(e.x)}" y2="${Z(e.z)}" stroke="${BLUE}" stroke-dasharray="2 5"/>`;
    s += `<circle cx="${X(e.x)}" cy="${Z(e.z)}" r="7" fill="none" stroke="${BLUE}" stroke-width="2"/>`;
    s += `<text x="${X(e.x) + 12}" y="${Z(e.z) + 4}" fill="${BLUE}">camera move ends here (${f(e.y)} m high)</text>`;
  }
  s += `<text x="${W - 8}" y="${H - 16}" text-anchor="end" fill="#8a7a5c">top view, seen from above, one grid square = 1 m</text>`;
  return svgWrap(W, H, s);
}

/** Side diagram along the camera's line of sight: camera height and tilt against the chair and the sitter. */
export function sideSvg(n: ShotNumbers): string {
  const cam = n.main.position;
  const h = (n.main.headingDeg * Math.PI) / 180;
  const along = (x: number, z: number): number => (x - cam.x) * Math.sin(h) + (z - cam.z) * Math.cos(h);
  const lookU = along(n.lookAt.x, n.lookAt.z);
  const chairU = n.chair ? along(n.chair.x, n.chair.z) : null;
  const farU = Math.max(lookU, chairU ?? 0) + 1.2;
  const topY = Math.max(cam.y, 2) + 0.4;
  const px = Math.max(40, Math.min(100, 900 / (farU + 0.6)));
  const W = (farU + 0.6) * px;
  const H = (topY + 0.6) * px;
  const U = (u: number): number => (u + 0.3) * px;
  const Y = (y: number): number => (topY - y) * px;

  let s = `<line x1="0" y1="${Y(0)}" x2="${W}" y2="${Y(0)}" stroke="${INK}" stroke-width="2"/>`;
  for (let y = 0; y <= Math.floor(topY); y++) {
    s += `<line x1="0" y1="${Y(y)}" x2="${W}" y2="${Y(y)}" stroke="${GRID}"/><text x="3" y="${Y(y) - 3}" fill="#8a7a5c">${y} m</text>`;
  }
  s += `<line x1="0" y1="${Y(TRIPOD_MAX_M)}" x2="${W}" y2="${Y(TRIPOD_MAX_M)}" stroke="${ACCENT}" stroke-dasharray="6 5" stroke-opacity="0.6"/>`;
  s += `<text x="${W - 6}" y="${Y(TRIPOD_MAX_M) - 4}" text-anchor="end" fill="${ACCENT}">normal tripod limit</text>`;

  if (chairU !== null) {
    const cw = CHAIR_WIDTH_M * px;
    const cx = U(chairU);
    s += `<rect x="${cx - cw / 2}" y="${Y(SEAT_HEIGHT_M)}" width="${cw}" height="${SEAT_HEIGHT_M * px * 0.45}" fill="#d9b48a" stroke="${INK}"/>`;
    s += `<rect x="${cx - cw / 2}" y="${Y(0.88)}" width="${cw * 0.18}" height="${(0.88 - SEAT_HEIGHT_M) * px}" fill="#b98d5d" stroke="${INK}"/>`;
    s += `<rect x="${cx - cw * 0.3}" y="${Y(SEATED_EYE_HEIGHT_M - 0.12)}" width="${cw * 0.35}" height="${(SEATED_EYE_HEIGHT_M - 0.12 - SEAT_HEIGHT_M) * px}" rx="6" fill="${ACCENT}" fill-opacity="0.4" stroke="${ACCENT}"/>`;
    s += `<circle cx="${cx - cw * 0.12}" cy="${Y(SEATED_EYE_HEIGHT_M + 0.02)}" r="${0.11 * px}" fill="${ACCENT}" fill-opacity="0.4" stroke="${ACCENT}"/>`;
    s += `<text x="${cx}" y="${Y(0) + 16}" text-anchor="middle" fill="${ACCENT}">chair + sitter</text>`;
  }
  // Camera and its line of sight.
  const camX = U(0);
  const camY = Y(cam.y);
  s += `<line x1="${camX}" y1="${camY}" x2="${U(lookU)}" y2="${Y(n.lookAt.y)}" stroke="${BLUE}" stroke-width="1.5"/>`;
  s += `<circle cx="${U(lookU)}" cy="${Y(n.lookAt.y)}" r="4" fill="${BLUE}"/>`;
  s += `<line x1="${camX}" y1="${camY}" x2="${camX}" y2="${Y(0)}" stroke="${BLUE}" stroke-dasharray="3 3"/>`;
  s += `<text x="${camX + 6}" y="${(camY + Y(0)) / 2}" fill="${BLUE}">${f(cam.y)} m</text>`;
  s += `<rect x="${camX - 12}" y="${camY - 9}" width="24" height="18" rx="3" fill="${BLUE}" stroke="${INK}"/>`;
  s += `<text x="${camX + 16}" y="${camY - 10}" fill="${BLUE}" font-weight="bold">camera, ${f(n.main.tiltDownDeg, 0)} deg down, ${n.main.lensMm} mm</text>`;
  s += `<text x="${W - 6}" y="${H - 6}" text-anchor="end" fill="#8a7a5c">side view along the camera's line of sight</text>`;
  return svgWrap(W, H, s);
}

// ---- markdown card -------------------------------------------------------------------------------------------

function rigPosition(r: CameraRig): string {
  return `X ${f(r.position.x)} m (${leftRight(r.position.x)} of the fireplace centerline), `
    + `Z ${f(r.position.z)} m out from the wall, height ${f(r.position.y)} m`;
}

export function shotCardMarkdown(input: ShotCardInput, n: ShotNumbers, files: { top: string; side: string }): string {
  const L: string[] = [];
  const m = n.main;
  L.push(`# Shot ${input.shotNumber}: ${input.title}`, '');
  L.push(`- Storyboard id: ${input.shotId}`, `- Scene: ${input.sceneName}`, `- Type: ${input.type}`, `- Length: ${input.durationSec} s`);
  L.push(`- Captured: ${input.capturedAt} (${input.resolution}, layer: ${input.layer}${input.vignette > 0 ? (input.vignette >= 1 ? ', vignette: full black' : `, vignette ${Math.round(input.vignette * 100)}%`) : ', no vignette'})`);
  L.push(`- Plate image: ${input.imageFile}`, '');
  if (input.notes.trim()) L.push('## Notes', '', input.notes.trim(), '');

  L.push('## Shoot-day diagram', '', `![Top view](${files.top})`, '', `![Side view](${files.side})`, '');
  L.push('Measure everything from the fireplace wall. "Right" and "left" are as you stand in the room facing the fireplace.', '');

  L.push('## Chair and seat', '');
  if (n.chair) {
    L.push(`- Chair center: ${f(n.chair.z)} m out from the wall, ${f(Math.abs(n.chair.x))} m to the ${leftRight(n.chair.x)} of the fireplace centerline.`);
    L.push(`- Chair is ${n.chair.facingText}.`);
    L.push(`- Sit centered in the chair, back against the backrest, hands on the armrests (the guide figure shows the pose).`);
    L.push(`- A normal armchair works: about ${CHAIR_WIDTH_M} m wide, seat about ${SEAT_HEIGHT_M} m high. Eyes end up about ${SEATED_EYE_HEIGHT_M} m off the floor.`);
  } else {
    L.push('- This scene has no armchair, so there is no seat to place.');
  }
  L.push('');

  L.push('## Camera', '');
  L.push(`Looks at a point ${f(n.lookAt.y)} m above the floor, ${f(n.lookAt.z)} m out from the wall, ${f(Math.abs(n.lookAt.x))} m ${leftRight(n.lookAt.x)} of the fireplace centerline.`, '');
  L.push(`**Main setup (${m.lensMm} mm full-frame equivalent):**`);
  L.push(`- Tripod at ${rigPosition(m)}.`);
  // The camera aims opposite to its offset from the look-at point; straight at the wall is orbit 0, positive = left.
  const aim = norm180(input.camera.orbitAngle);
  L.push(`- Tilt down ${f(m.tiltDownDeg, 1)} deg. ${Math.abs(aim) < 1 ? 'Aimed straight at the fireplace wall' : `Aimed ${f(Math.abs(aim), 0)} deg to the ${aim > 0 ? 'left' : 'right'} of straight at the fireplace wall (seen from above)`}.`);
  L.push(`- ${f(m.distanceM, 1)} m from the point it looks at. Frame the shot to match the plate image, then lock the tripod.`);
  if (n.cameraFromChair) L.push(`- ${f(n.cameraFromChair.distanceM, 1)} m from the chair, ${n.cameraFromChair.text}.`);
  if (n.suggestion) L.push(`- WARNING: ${n.suggestion}`);
  L.push('');
  if (n.end) {
    L.push(`**Camera move:** the shot ends at ${rigPosition(n.end)}, tilt ${f(n.end.tiltDownDeg, 1)} deg down. Do the move over ${input.durationSec} s.`, '');
  }

  L.push('## Other lenses', '', 'The sandbox camera is orthographic (no perspective), so a longer lens matches it better. Same framing, different distance:', '');
  L.push('| Lens | Distance | Tripod X (m) | Tripod Z (m) | Height (m) | Tripod OK |', '|---|---|---|---|---|---|');
  for (const r of n.lenses) {
    L.push(`| ${r.lensMm} mm | ${f(r.distanceM, 1)} m | ${f(r.position.x)} | ${f(r.position.z)} | ${f(r.position.y)} | ${r.heightOk ? 'yes' : 'needs ladder'} |`);
  }
  L.push('');

  L.push('## Raw sandbox numbers', '');
  const c = input.camera;
  L.push(`- Orbit ${c.orbitAngle.toFixed(1)} deg, tilt ${c.orbitHeight.toFixed(2)}, zoom ${c.zoom.toFixed(2)}x`);
  if (input.endCamera) L.push(`- End: orbit ${input.endCamera.orbitAngle.toFixed(1)} deg, tilt ${input.endCamera.orbitHeight.toFixed(2)}, zoom ${input.endCamera.zoom.toFixed(2)}x`);
  L.push(`- Look-at (sandbox units): ${input.target.map((v) => v.toFixed(2)).join(', ')}`);
  L.push(`- Scale used: 1 sandbox unit = ${REAL_M_PER_UNIT} m (from a ${CHAIR_WIDTH_M} m armchair). If the real room is smaller, pick a shorter lens.`, '');

  L.push('## Shoot-day checklist', '');
  L.push('- [ ] Green screen up and evenly lit', '- [ ] Chair placed and turned as above', '- [ ] Tripod at the marked spot, height and tilt set', '- [ ] Lens set, shot framed to match the plate image', '- [ ] Light direction matches the plate (fire glow comes from the wall, warm)', '- [ ] Record a clean pass with the chair empty if the edit needs it', '');
  return L.join('\n');
}
