# Testing VR without a headset

Use Meta's **Immersive Web Emulator** to exercise Misc. Palace's WebXR mode in desktop Chromium, Chrome, or Edge. It emulates headset poses and controller input, not Quest hardware or performance.

## Install in Chromium

- [Chrome Web Store: Immersive Web Emulator](https://chromewebstore.google.com/detail/immersive-web-emulator/cgffilbpcibhmcfbgggfhfolhkfbhmik)
- [Official source and usage instructions](https://github.com/meta-quest/immersive-web-emulator/)
- [Official releases](https://github.com/meta-quest/immersive-web-emulator/releases)

Open the store link in Chromium and install the extension. If your Chromium build cannot install from the store, download an extension build from the official releases, extract it, open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**. Select the extracted extension directory containing `manifest.json` (not the ZIP or the repository source directory).

The interface depends on the installed version: store builds may expose a **WebXR** tab in Developer Tools; newer builds may use an on-page controls overlay. Follow the usage instructions for your installed release.

## Run the app

From the repository root:

```bash
cd dev-sandbox
npm install
npm run dev -- --host 127.0.0.1
```

Open the localhost URL Vite prints, normally `http://localhost:5173`. If the preview is already running, use it instead of starting another server.

WebXR requires a secure context: localhost works for desktop development; remote access should use HTTPS. An ordinary HTTP LAN or Tailscale-IP URL is not sufficient.

## Enter emulated VR

1. Enable the extension for the app page.
2. Open Developer Tools with **F12** or **Ctrl+Shift+I**.
3. Find **WebXR**, possibly under the `»` overflow menu, or open the emulator's overlay controls if your version uses those.
4. Choose a supported Quest device profile and enable emulation if necessary.
5. Reload the app after enabling emulation.
6. Click the app's **Enter VR** button.
7. Use the emulator's headset transform controls to move and rotate your viewpoint. Use its controller controls to position the hands and simulate trigger, grip, button, and joystick input. Consult its displayed key bindings rather than assuming shortcuts are identical between versions.

Use a disposable test room or export your room before changing placements. Emulated VR uses this browser's normal app storage; it is not automatically isolated from desktop saves, and it does not share the physical Quest's storage.

## Manual test checklist

### Sky anchoring and rendering

- Choose a visibly patterned sky, such as stars, clouds, or aurora.
- Enter VR and rotate the **emulated headset**, not the normal desktop room camera.
- Sky features should remain world-oriented: they move through your view when you turn, rather than staying glued to the screen.
- Return to the original orientation; the same sky features should return to the same directions.
- Translate the headset without rotating. The distant sky should not show nearby-object parallax.
- Change backgrounds while immersed and repeat, including a custom upload.
- Exit VR: the original desktop background presentation/cropping should return.
- Ordinary non-panoramic uploads may have visible seams or distortion when wrapped around the VR world.

### Movement and interaction

- Aim a controller at the ground and trigger teleport, including the extended floor area.
- Check snap turns using the emulated controller joystick.
- Travel to the loft and back. Check the loft travel beacon is hidden while on the loft and outside VR.
- Select an object and check its world-space action buttons are usable.
- Exercise Move, place on an empty slot, and Put away; check desktop selection still uses its normal UI after leaving VR.
- Try lighting, wall/floor/background options, and room/theme controls. Check paginated choices remain reachable.
- Changing lighting alone should not overwrite independently selected surfaces.
- Check Developer Tools' Console for errors.

## Automated checks

From `dev-sandbox`:

```bash
npm test
npm run build
```

The browser checks need Playwright (`npm install --no-save --package-lock=false playwright`) and Chromium with working WebGL. With Vite already running, run:

```bash
node tests/browser-xr-background.mjs
node tests/browser-xr-preview.mjs
```

Optional overlay-chrome scripts (not part of `npm test`) exercise the current desktop/mobile chrome against Edit room / Rooms / the item inspector:

```bash
node tests/browser-desktop-chrome.mjs
node tests/browser-mobile-chrome.mjs
```

They are not neighborhood-visit tests. `npm test` still only bundles `*.test.ts`.

Options: `MP_URL` selects the Vite origin (default `http://127.0.0.1:5173`), `CHROMIUM_PATH` selects the browser executable (default `/usr/bin/chromium`), and `PLAYWRIGHT_MODULE` can point to an existing Playwright module file instead of a local install. Both scripts enable GL/WebGL and ignore the GPU blocklist. The preview check writes `xr-preview.png` under `TMPDIR` (or the OS temporary directory).

The background regression uses synthetic stereo poses; the preview check invokes XR lifecycle methods with synthetic state and renders real canvas/WebGL pixels. Neither is an immersive WebXR session or a physical headset test.

## Troubleshooting

- **Enter VR unavailable:** confirm the extension is enabled for this page, enable emulation, reload, and use localhost or HTTPS.
- **No WebXR DevTools tab:** inspect overflow tabs, reopen Developer Tools, and check whether your extension version uses an overlay instead.
- **Inputs do nothing:** make sure an immersive session is active, a controller is connected in the emulator, and the page/overlay has the appropriate input focus.
- **Blank scene:** check Console errors, WebGL availability, and browser graphics acceleration. Disable competing WebXR emulator extensions.

## Still test on a real Quest

Desktop emulation cannot validate headset frame rate, GPU/memory limits, real controller tracking, hand tracking quality, stereo comfort, perceived scale, readability, or motion sickness. Use it for fast iteration, then verify important changes on physical hardware before calling Quest support tested.

[Meta's WebXR workflow documentation](https://developers.meta.com/vr/documentation/web/webxr-workflow/)
