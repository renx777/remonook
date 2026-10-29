import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
await build({entryPoints:['src/pdf-capture.ts'],bundle:true,packages:'external',outfile:'tests/.build/pdf-capture.mjs',format:'esm',platform:'node'});
const {capturePixels,capturePdfCanvas}=await import('./.build/pdf-capture.mjs');
test('capture geometry maps CSS-independent fractions to backing pixels and rejects invalid regions',()=>{
 assert.deepEqual(capturePixels({x:.1,y:.2,w:.3,h:.4},2000,3000),{x:200,y:600,width:600,height:1200});
 assert.deepEqual(capturePixels({x:0,y:0,w:1,h:1},800,1100),{x:0,y:0,width:800,height:1100});
 for(const rect of [{x:-1,y:0,w:1,h:1},{x:0,y:0,w:0,h:1},{x:0,y:0,w:2,h:1},{x:NaN,y:0,w:1,h:1},{x:0,y:0,w:.00001,h:.00001}])assert.throws(()=>capturePixels(rect,100,100));
});
test('capture freezes only document pixels before async encoding and stays inside the existing attachment budget',async()=>{
 const original=globalThis.document,calls=[],encodes=[];globalThis.document={createElement(){return {width:0,height:0,getContext(){return {drawImage(...args){calls.push(args);}};},toBlob(callback,type){encodes.push(type);callback(new Blob([type==='image/png'?new Uint8Array(2100000):'small image'],{type}));}};}};
 try{const source={width:2000,height:3000},blob=await capturePdfCanvas(source,{x:.1,y:.1,w:.5,h:.5});assert.equal(calls[0][0],source);assert.equal(calls[0][1],200);assert.equal(calls[0][3],1000);assert.equal(calls[0][4],1500);assert.deepEqual(encodes,['image/png','image/webp']);assert.equal(blob.type,'image/webp');assert.ok(blob.size<=2*1024*1024);}finally{globalThis.document=original;}
});
