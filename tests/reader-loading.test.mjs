import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';import vm from 'node:vm';import {PDF_VERSION} from '../src/pdf-version.mjs';
test('reader workers and PDF parsing stay out of the initial offline download',()=>{
 const sw=readFileSync('dist/sw.js','utf8'),files=JSON.parse(sw.match(/FILES=(\[.*?\]);/s)[1]);assert.ok(!files.some(f=>/\/(PdfPage|PdfDocument|book-cover|pdf-capture|pdf-|pdf\.|pdf-runtime|epub-worker)/.test(f)));assert.ok(readdirSync('dist/pdf/'+PDF_VERSION+'/cmaps').length>0);assert.ok(readdirSync('dist/pdf/'+PDF_VERSION+'/standard_fonts').length>0);assert.ok(readdirSync('dist/pdf/'+PDF_VERSION+'/wasm').length>0);
});
test('opened reader assets cache on use while private cross-origin books never enter the shared shell cache',async()=>{
 const listeners={},stored=new Map();let fetched=0;const origin='https://staging.remonook.com';
 const cache={async keys(){return [...stored.keys()].map(url=>new Request(url));},async delete(request){return stored.delete(request.url);},async match(request){return stored.get(request.url)?.clone();},async put(request,response){stored.set(request.url,response.clone());}};
 vm.runInNewContext(readFileSync('dist/sw.js','utf8'),{URL,self:{location:{origin},addEventListener:(type,handler)=>listeners[type]=handler},caches:{open:async()=>cache},fetch:async()=>{fetched++;return new Response('reader worker');}});
 const send=async url=>{let result;listeners.fetch({request:new Request(url),respondWith(promise){result=promise;}});return result?await result:undefined;};
 const asset=origin+'/assets/pdf.worker.min-test.mjs';assert.equal(await(await send(asset)).text(),'reader worker');assert.equal(fetched,1);assert.ok(stored.has(asset));await send(asset);assert.equal(fetched,1);
 assert.equal(await send('https://remo-sync-staging.remo-978fb.workers.dev/books/private'),undefined);assert.equal(stored.size,1);
});
