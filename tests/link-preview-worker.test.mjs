import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import handler from '../web/staging.mjs';
const {Miniflare,convertV4MiniflareOptions}=await import(process.env.REMONOOK_WORKER_TEST_RUNTIME||'miniflare');
test('native Workers parser follows a public short link, extracts product metadata, caches it and rejects private redirect/DNS targets',async()=>{
 const bundle=await build({entryPoints:['web/staging.mjs'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'}),calls=[];
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-24',ratelimits:{LINK_PREVIEW_LIMITER:{namespace_id:'32701',simple:{limit:60,period:60}}},outboundService:async request=>{
  const url=new URL(request.url);calls.push(request.url);assert.equal(request.headers.get('Cookie'),null);assert.equal(request.headers.get('Authorization'),null);
  if(url.hostname==='cloudflare-dns.com')return Response.json({Status:0,Answer:url.searchParams.get('type')==='A'?[{type:1,data:url.searchParams.get('name')==='private.example.com'?'127.0.0.1':'8.8.8.8'}]:[]});
  if(url.hostname==='short.example.com')return new Response(null,{status:302,headers:{Location:'https://shop.example.com/product'}});
  if(url.hostname==='www.amazon.in')return new Response('<title>Amazon product</title>'+(' '.repeat(600000))+'<span id="productTitle">AULA F75</span><img id="landingImage" data-old-hires="https://m.media-amazon.com/keyboard.jpg">',{headers:{'Content-Type':'text/html'}});
  if(url.pathname==='/private-redirect')return new Response(null,{status:302,headers:{Location:'http://169.254.169.254/metadata'}});
  return new Response(`<html><head><title>Product</title><meta property="og:site_name" content="全球 shop"><script type="application/ld+json">${JSON.stringify({'@type':'Product',name:'AULA F75',image:'/keyboard.jpg',offers:{price:'5999',priceCurrency:'INR',availability:'https://schema.org/InStock'}})}</script></head></html>`,{headers:{'Content-Type':'text/html'}});
 }}));
 try{
  const endpoint='https://app.example.com/api/link-preview?url='+encodeURIComponent('https://short.example.com/a');
  let r=await mf.dispatchFetch(endpoint);assert.equal(r.status,200,await r.clone().text());const data=await r.json();assert.equal(data.title,'AULA F75');assert.equal(data.site,'全球 shop');assert.equal(data.price.currency,'INR');assert.equal(data.image,'https://shop.example.com/keyboard.jpg');assert.equal(data.url,'https://shop.example.com/product');
  await new Promise(resolve=>setTimeout(resolve,100));const n=calls.length;assert.equal((await mf.dispatchFetch(endpoint)).status,200);assert.equal(calls.length,n,'edge cache avoids repeat DNS and site fetches');
  r=await mf.dispatchFetch('https://app.example.com/api/link-preview?url='+encodeURIComponent('https://shop.example.com/private-redirect'));assert.equal(r.status,422);assert.ok(!calls.some(value=>value.includes('169.254.169.254')));
  r=await mf.dispatchFetch('https://app.example.com/api/link-preview?url='+encodeURIComponent('https://private.example.com/product'));assert.equal(r.status,422);assert.ok(!calls.some(value=>new URL(value).hostname==='private.example.com'));
  assert.equal((await mf.dispatchFetch(endpoint,{headers:{Origin:'https://another.example.com'}})).status,403);
  const amazon=await mf.dispatchFetch('https://app.example.com/api/link-preview?url='+encodeURIComponent('https://www.amazon.in/dp/B0CYZHC69C'));assert.equal(amazon.status,200);const product=await amazon.json();assert.equal(product.title,'AULA F75');assert.equal(product.image,'https://m.media-amazon.com/keyboard.jpg');assert.equal(product.price,null);
 }finally{await mf.dispose();}
});
test('preview endpoint denies over-limit traffic, private URLs and wrong methods without sending a request',async()=>{
 const ctx={waitUntil(){}},url='https://app.example.com/api/link-preview?url='+encodeURIComponent('https://example.com/');
 assert.equal((await handler.fetch(new Request(url),{LINK_PREVIEW_LIMITER:{limit:async()=>({success:false})}},ctx)).status,429);
 assert.equal((await handler.fetch(new Request(url,{method:'POST'}),{},ctx)).status,405);
 assert.equal((await handler.fetch(new Request('https://app.example.com/api/link-preview?url=http://127.0.0.1'),{},ctx)).status,400);
});
