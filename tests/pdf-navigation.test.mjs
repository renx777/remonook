import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
await build({entryPoints:['src/pdf-navigation.ts'],bundle:true,packages:'external',outfile:'tests/.build/pdf-navigation.mjs',format:'esm',platform:'node'});
const {searchablePage,pageMatches,PdfTextIndex,pdfChapters}=await import('./.build/pdf-navigation.mjs');
test('search maps normalized phrases and ligatures back to original PDF text offsets',()=>{
 const page=searchablePage([{str:'The ﬁrst',hasEOL:true},{str:'chapter'}]);const hit=pageMatches(page,'FIRST CHAPTER',4)[0];assert.equal(hit.unit,4);assert.equal(hit.start,4);assert.equal(hit.end,'The ﬁrstchapter'.length);assert.ok(hit.snippet.includes('first chapter'));
 const formatted=searchablePage([{str:'inter',width:30,transform:[10,0,0,10,0,0]},{str:'national',width:50,transform:[10,0,0,10,30,0]}]);assert.equal(pageMatches(formatted,'international',0).length,1);
 assert.equal(pageMatches(page,'no match',0).length,0);assert.equal(pageMatches(page,' ',0).length,0);
});
test('PDF search is bounded, caches page text and discards canceled work',async()=>{
 let calls=0;const pdf={numPages:3,getPage:async()=>({getTextContent:async()=>{calls++;return {items:[{str:'topic topic'}]};}})},index=new PdfTextIndex(pdf),updates=[];
 await index.search('topic',new AbortController().signal,(hits,scanned)=>updates.push([hits,scanned]));assert.equal(updates.at(-1)[0].length,6);assert.equal(updates.at(-1)[1],3);
 await index.search('other',new AbortController().signal,()=>{});assert.equal(calls,3,'Repeated searches reuse the bounded text cache');
 const controller=new AbortController();controller.abort();await assert.rejects(index.search('topic',controller.signal,()=>assert.fail('Canceled search must not publish results')),error=>error.name==='AbortError');
 const capped=new PdfTextIndex({numPages:5,getPage:async()=>({getTextContent:async()=>({items:[{str:'x '.repeat(600)}]})})});let result;await capped.search('x',new AbortController().signal,(...args)=>result=args);assert.equal(result[0].length,500);assert.equal(result[2],true);
});
test('chapter navigation resolves named and reference destinations and tolerates broken/external entries',async()=>{
 const pdf={numPages:10,getOutline:async()=>[{title:'Start',dest:'intro',items:[{title:'Section',dest:[{num:2,gen:0}],items:[]}]},{title:'External',url:'javascript:alert(1)',items:[]},{title:'Broken',dest:'broken',items:[]}],getDestination:async name=>name==='intro'?[0]:null,getPageIndex:async()=>5};
 const outline=await pdfChapters(pdf,new AbortController().signal);assert.equal(outline[0].unit,0);assert.equal(outline[0].children[0].unit,5);assert.equal(outline[1].unit,null);assert.equal(outline[2].unit,null);
 assert.deepEqual(await pdfChapters({...pdf,getOutline:async()=>null},new AbortController().signal),[]);
});
