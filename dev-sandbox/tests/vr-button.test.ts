import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomView } from '../src/views/room';

// Exercise the real availability lifecycle without constructing a WebGL renderer.
async function check(supported: boolean) {
  Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { xr: { isSessionSupported: async (mode: string) => {
    assert.equal(mode, 'immersive-vr');
    return supported;
  } } } });
  const vrButton = { hidden: false, disabled: false, title: '', textContent: '' };
  await (RoomView.prototype as any).refreshVrButton.call({ vrButton });
  return vrButton;
}

test('pending probe hides the control until support resolves true', async () => {
  let resolve!: (supported: boolean) => void;
  const result = new Promise<boolean>((done) => { resolve = done; });
  Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { xr: { isSessionSupported: () => result } } });
  const vrButton = { hidden: false, disabled: false, title: '', textContent: '' };
  const pending = (RoomView.prototype as any).refreshVrButton.call({ vrButton });
  assert.equal(vrButton.hidden, true);
  assert.equal(vrButton.disabled, true);
  resolve(true);
  await pending;
  assert.equal(vrButton.hidden, false);
  assert.equal(vrButton.disabled, false);
  assert.equal(vrButton.textContent, 'Enter VR');
});

test('rejected support probe stays hidden without an unhandled rejection', async () => {
  Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { xr: { isSessionSupported: async () => { throw new Error('denied'); } } } });
  const vrButton = { hidden: false, disabled: false };
  await (RoomView.prototype as any).refreshVrButton.call({ vrButton });
  assert.equal(vrButton.hidden, true);
  assert.equal(vrButton.disabled, true);
});

for (const secure of [false, true]) {
  test(secure ? 'missing WebXR stays hidden' : 'insecure context stays hidden without probing', async () => {
    Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: secure });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { xr: secure ? undefined : { isSessionSupported: () => assert.fail('must not probe') } } });
    const vrButton = { hidden: false, disabled: false };
    await (RoomView.prototype as any).refreshVrButton.call({ vrButton });
    assert.equal(vrButton.hidden, true);
    assert.equal(vrButton.disabled, true);
  });
}

test('unavailable immersive VR is hidden, not just disabled', async () => {
  const button = await check(false);
  assert.equal(button.hidden, true);
  assert.equal(button.disabled, true);
});
