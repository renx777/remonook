import {previewFetchUrl,previewRedirect} from '../src/public-preview-url.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {metadataPreview,previewUrl,publicAddress,linkPreview,readMetadata,checkPublicHost} from '../web/link-preview.mjs';
const base='https://shop.example.com/products/keyboard';
test('global product metadata preserves supplied currencies, Unicode, ratings and availability',()=>{
 const p=metadataPreview({meta:{'og:title':'Fallback','og:site_name':'世界商店'},scripts:[JSON.stringify({'@graph':[{'@type':'WebSite'},{'@type':'Product',name:'キーボード &amp; café',description:'A quiet keyboard',image:'/images/one.jpg',brand:{name:'AULA'},offers:{price:'1299.00',priceCurrency:'INR',availability:'https://schema.org/InStock'},aggregateRating:{ratingValue:'4.5',reviewCount:'639'}}]})]},base,10);
 assert.equal(p.title,'キーボード & café');assert.equal(p.site,'世界商店');assert.equal(p.image,'https://shop.example.com/images/one.jpg');assert.deepEqual(p.price,{amount:'1299.00',currency:'INR',from:false});assert.equal(p.availability,'In stock');assert.deepEqual(p.rating,{value:4.5,best:5,count:639});assert.equal(p.capturedAt,10);
});
test('Open Graph works on any public domain; absent product facts remain absent',()=>{
 const p=metadataPreview({meta:{'og:title':'Handmade lamp','og:image':'//cdn.example.com/lamp.png','og:description':'A warm light','product:price:amount':'49.99','product:price:currency':'EUR'}},base);
 assert.equal(p.title,'Handmade lamp');assert.equal(p.image,'https://cdn.example.com/lamp.png');assert.equal(p.price.currency,'EUR');assert.equal(p.availability,null);assert.equal(p.rating,null);assert.equal(p.brand,null);
 const bare=metadataPreview({title:'An ordinary page'},base);assert.equal(bare.image,null);assert.equal(bare.price,null);
});
test('malformed scripts, unsafe images and invalid prices do not become convincing product data',()=>{
 const p=metadataPreview({title:'A page',meta:{'og:image':'http://127.0.0.1/private'},scripts:['not json',JSON.stringify({'@type':'Product',name:'Product',offers:{price:'call for price',priceCurrency:'USD'},aggregateRating:{ratingValue:8,bestRating:5}})]},base);
 assert.equal(p.image,null);assert.equal(p.price,null);assert.equal(p.rating,null);assert.throws(()=>metadataPreview({title:'Just a moment…'},base));
});
test('product ranges are labelled from; localized numbers without unambiguous machine prices are not guessed',()=>{
 const p=metadataPreview({scripts:[JSON.stringify({'@type':['Thing','ProductGroup'],name:'Shoes',offers:{'@type':'AggregateOffer',lowPrice:'98.00',highPrice:'120.00',priceCurrency:'GBP'}})]},base);assert.deepEqual(p.price,{amount:'98.00',currency:'GBP',from:true});
 assert.equal(metadataPreview({scripts:[JSON.stringify({'@type':'Product',name:'Shoes',offers:{price:'1.299,00',priceCurrency:'EUR'}})]},base).price,null);
});
test('public URL and DNS policy rejects credentials, signed links, private and reserved addresses',async()=>{
 for(const url of ['file:///tmp/a','http://localhost/','http://127.1/','http://[::1]/','https://foo.local/','https://user:pw@example.com','https://example.com/?access_token=private'])assert.throws(()=>previewUrl(url),url);
 for(const ip of ['127.0.0.1','10.1.2.3','169.254.169.254','100.64.1.1','192.168.1.1','172.20.1.1','0.0.0.0','::1','fc00::1','fe80::1','2001:db8::1'])assert.equal(publicAddress(ip),false,ip);
 assert.ok(publicAddress('8.8.8.8'));assert.ok(publicAddress('2606:4700:4700::1111'));
 await assert.rejects(checkPublicHost('public-name.example.com',async()=>Response.json({Status:0,Answer:[{type:1,data:'127.0.0.1'}]})));
});
test('redirects are public-checked at every hop and never forward cookies or authorization',async()=>{
 const calls=[],checked=[];
 const p=await linkPreview('https://amzn.in/example',{resolveHost:async host=>checked.push(host),fetcher:async(url,options)=>{calls.push({url,options});return calls.length===1?new Response(null,{status:302,headers:{Location:base}}):new Response('<title>Keyboard</title><meta property="og:image" content="/image.jpg">',{headers:{'Content-Type':'text/html'}});}});
 assert.equal(p.title,'Keyboard');assert.deepEqual(checked,['amzn.in','shop.example.com']);for(const {options} of calls){assert.equal(options.redirect,'manual');assert.equal(options.headers.Cookie,undefined);assert.equal(options.headers.Authorization,undefined);}
 let n=0;await assert.rejects(linkPreview(base,{resolveHost:async()=>{},fetcher:async()=>{n++;return new Response(null,{status:302,headers:{Location:'http://169.254.169.254/metadata'}});}}));assert.equal(n,1);
});
test('blocked responses, non-HTML, loops and network failures retain an honest unavailable result',async()=>{
 for(const response of [new Response('No',{status:403}),new Response('{}',{headers:{'Content-Type':'application/json'}})])await assert.rejects(linkPreview(base,{resolveHost:async()=>{},fetcher:async()=>response}));
 let count=0;await assert.rejects(linkPreview(base,{resolveHost:async()=>{},fetcher:async()=>{count++;return new Response(null,{status:302,headers:{Location:base}});}}));assert.equal(count,5);
 await assert.rejects(linkPreview(base,{resolveHost:async()=>{},fetcher:async()=>{throw Error('network');}}));
});
test('bounded HTML reader cancels oversized responses and never executes page scripts',async()=>{
 let cancelled=false,executed=false;globalThis.__previewTestRun=()=>{executed=true;};
 const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('<title>Bounded page</title><script>__previewTestRun()</script>'+('x'.repeat(600000))));},cancel(){cancelled=true;}});
 const p=await readMetadata(new Response(stream),'https://example.com/');assert.equal(p.title,'Bounded page');assert.equal(cancelled,true);assert.equal(executed,false);delete globalThis.__previewTestRun;
});

test('Myntra mailers and malformed share redirects resolve safely without changing note URLs',()=>{const original='https://www.myntra.com/mailers/casual-shoes/brand/item/19463716/buy?shared=true';assert.equal(previewFetchUrl(original).pathname,'/casual-shoes/brand/item/19463716/buy');assert.equal(previewRedirect('https, https://www.myntra.com/casual-shoes/19463716/buy',original).href,'https://www.myntra.com/casual-shoes/19463716/buy');assert.throws(()=>previewRedirect('https, http://127.0.0.1/private',original));});

test('a catalogue does not use the first unrelated product as its preview; country selectors are unavailable',()=>{const p=metadataPreview({title:'A collection',scripts:[JSON.stringify({'@type':'ItemList',itemListElement:[{'@type':'Product',name:'Unrelated product',offers:{price:'1',priceCurrency:'USD'}}]})]},base);assert.equal(p.kind,'page');assert.equal(p.title,'A collection');assert.equal(p.price,null);assert.throws(()=>metadataPreview({title:'Best Buy International: Select your Country - Best Buy'},base));});
