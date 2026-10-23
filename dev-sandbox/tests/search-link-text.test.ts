import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LinkTextCache, linkTextTarget, indexLinkTexts} from '../src/core/search-link-text';
const url='https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/javascript/index.md';
test('refresh failure retains explicitly stale text, oversized responses are refused',async()=>{
 let now=0;let fail=false;
 const cache=new LinkTextCache(async()=>{if(fail)throw new TypeError('CORS');return new Response('Known article body',{headers:{'content-type':'text/plain'}});},()=>now);
 await cache.load(url,new AbortController().signal);now=16*60_000;fail=true;
 const stale=await cache.load(url,new AbortController().signal);assert.equal(stale.status,'stale');assert.equal(stale.text,'Known article body');assert.match(stale.reason!,/CORS/);
 const large=new LinkTextCache(async()=>new Response('a'.repeat(512_001),{headers:{'content-type':'text/plain'}}));assert.equal((await large.load(url,new AbortController().signal)).status,'unavailable');
});
test('two concurrent workers deduplicate sources and discard cancelled callbacks',async()=>{
 let active=0,peak=0,calls=0;
 const cache=new LinkTextCache(async()=>{calls++;active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;return new Response('Article body',{headers:{'content-type':'text/plain'}});});
 const seen:string[]=[];await indexLinkTexts([url,url,url+'?1',url+'?2',url+'?3'],cache,new AbortController().signal,source=>seen.push(source));
 assert.equal(peak,2);assert.equal(calls,4);assert.equal(seen.length,4);
 const controller=new AbortController();const pending=indexLinkTexts([url+'?4',url+'?5',url+'?6'],cache,controller.signal,()=>assert.fail('late update'));controller.abort();await pending;
});
test('only explicitly trusted public HTTPS publishers, without credentials, ports or redirects',()=>{
 assert.equal(linkTextTarget(url),url);
 assert.equal(linkTextTarget('https://developer.mozilla.org/en-US/docs/Web/JavaScript'),url);
 for(const bad of ['file:///etc/passwd','http://127.0.0.1/','https://192.168.1.1/','https://[::1]/','https://localhost/','https://printer.local/','https://raw.githubusercontent.com.evil.test/','https://user:pass@raw.githubusercontent.com/x','https://raw.githubusercontent.com:444/x','https://arbitrary.example/article'])assert.equal(linkTextTarget(bad),null);
});
test('fetches actual text with no credentials/referrer, caches separately and refreshes stale content',async()=>{
 let now=0,calls=0;const cache=new LinkTextCache(async(_url,options)=>{calls++;assert.equal(options?.credentials,'omit');assert.equal(options?.redirect,'error');assert.equal(options?.referrerPolicy,'no-referrer');return new Response('Actual nebula article',{headers:{'content-type':'text/plain'}});},()=>now);
 const first=await cache.load(url,new AbortController().signal);assert.equal(first.status,'ready');assert.match(first.text!,/nebula/);
 await cache.load(url,new AbortController().signal);assert.equal(calls,1);
 now=16*60_000;assert.equal(cache.peek(url)?.status,'stale');await cache.load(url,new AbortController().signal);assert.equal(calls,2);
});
test('CORS failures, unsupported content, timeouts and aborts are honest and bounded',async()=>{
 const failure=new LinkTextCache(async()=>{throw new TypeError('Failed to fetch');});
 assert.equal((await failure.load(url,new AbortController().signal)).status,'unavailable');
 assert.equal((await failure.load('https://localhost/',new AbortController().signal)).status,'unavailable');
 const binary=new LinkTextCache(async()=>new Response('binary',{headers:{'content-type':'image/png'}}));assert.equal((await binary.load(url,new AbortController().signal)).status,'unavailable');
 const hanging=new LinkTextCache(async(_url,options)=>new Promise((_resolve,reject)=>{options?.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));}),Date.now,10);
 assert.equal((await hanging.load(url,new AbortController().signal)).status,'unavailable');
 const cancel=new AbortController();const pending=hanging.load(url+'?cancel',cancel.signal);cancel.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(hanging.peek(url+'?cancel'),undefined);
});
