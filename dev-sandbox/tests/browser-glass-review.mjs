// Interactive review page exercises production WebGL panels; not physical headset evidence.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const out = process.env.XR_EVIDENCE_DIR ?? join(tmpdir(), 'manor-glass-evidence');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless:true, args:['--use-angle=gl','--enable-webgl','--ignore-gpu-blocklist'] });
try {
 const page=await browser.newPage({viewport:{width:1600,height:1100}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto(new URL('/tests/vr-glass-review.html',process.env.MP_URL??'http://127.0.0.1:5538').href);
 await page.waitForFunction(()=>window.review);
 const shot=async name=>{await page.waitForTimeout(150);await page.screenshot({path:join(out,name+'.png')});};
 await shot('review-glass-home');
 await page.selectOption('#room','omari'); await shot('review-glass-omari');
 assert.ok(await page.evaluate(()=>review.room.objectsGroup.children.length)>10);
 await page.selectOption('#room','vinyl-lounge'); await shot('review-glass-vinyl-lounge');
 await page.getByRole('button',{name:'Keyboard',exact:true}).click(); await shot('review-glass-keyboard');
 const typed=await page.evaluate(()=>{const p=review.panel;const b=p.shown.find(b=>b.id==='key:w');p.activate({x:b.x/1024,y:1-b.y/1408});return p.draft.title;});
 assert.ok(typed.includes('w'),'production keyboard hit works in review');
 await page.getByRole('button',{name:'Object / preview',exact:true}).click(); await shot('review-glass-preview');
 assert.deepEqual(errors,[]);
 const result={errors,typed,shots:5}; writeFileSync(join(out,'review-results.json'),JSON.stringify(result,null,2));
 console.log('PASS interactive WebGL review, three rooms, keyboard hit, object preview',result);
}finally{await browser.close();}
