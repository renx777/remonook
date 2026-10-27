import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import catalog from '../src/fluent-emoji-catalog.json' with {type:'json'};
import {fluentEmojis,getFluentEmoji,fluentAssetUrl,fluentStaticPoster,downloadFluentEmoji,FLUENT_CREDIT,FLUENT_CREDIT_PATH,fluentPosterPath} from '../src/fluent-emojis.mjs';
import {catalogEmojis,catalogAssetPaths,getCatalogEmoji} from '../src/emoji-catalog.mjs';
import {emojiSuggestions} from '../src/emoji-suggestions.mjs';
import {empty,archive,parseArchive,references,androidBlockers} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';
import {insertEmoji} from '../src/emoji.mjs';
import {seed,sharedState,openShared,project} from '../src/sync-crdt.mjs';
import {initializeOutbox,stageAssets,recordLocal} from '../src/sync-outbox.mjs';
const fixture=code=>readFile(new URL(`./fixtures/fluent/${code}.png`,import.meta.url));

test('Fluent catalog maps unique Unicode variants, pinned sources and supported sizes; combined search offers both collections',()=>{
 assert.equal(fluentEmojis.length,814);assert.equal(catalog.items.length+catalog.excludedOversize+catalog.excludedUnmapped,catalog.totalAnimations);
 assert.equal(new Set(fluentEmojis.map(x=>x.token)).size,fluentEmojis.length);
 for(const item of fluentEmojis){assert.ok(item.bytes<=2*1024*1024);assert.equal(getCatalogEmoji(item.token),item);assert.match(fluentAssetUrl(item),/^https:\/\/media\.githubusercontent\.com\/media\/microsoft\/fluentui-emoji-animated\/[a-f0-9]{40}\/assets\//);assert.equal(catalogAssetPaths(item).length,3);}
 assert.equal(getFluentEmoji(':fluent_1f44d_1f3fb:').fallback,'👍🏻');assert.equal(getFluentEmoji(':fluent_1f426_200d_1f525:').fallback,'🐦‍🔥');
 const result=emojiSuggestions(catalogEmojis,'grinning face');assert.ok(result.some(x=>x.token.startsWith(':noto_')));assert.ok(result.some(x=>x.token.startsWith(':fluent_')));
 assert.equal(getFluentEmoji(':fluent_1f680:'),undefined,'Oversized animations are not offered as saveable choices');
});

test('Fluent download verifies original bytes, refuses corrupt content and creates a true non-animated PNG poster',async()=>{
 const original=globalThis.fetch,requests=[];let body=await fixture('1f600');
 globalThis.fetch=async(url,options)=>{requests.push({url,options});return new Response(body);};
 try{
  const item=getFluentEmoji(':fluent_1f600:'),assets=await downloadFluentEmoji({...item,animationPath:'../../evil',fileName:'evil.png'});
  assert.equal(assets.size,3);assert.equal(requests.length,1);assert.equal(requests[0].url,fluentAssetUrl(item));assert.equal(requests[0].options.credentials,'omit');
  assert.deepEqual(new Uint8Array(await assets.get('emoji/'+item.fileName).arrayBuffer()),new Uint8Array(body));
  const poster=new Uint8Array(await assets.get(fluentPosterPath(item)).arrayBuffer()),view=new DataView(poster.buffer);let at=8;const types=[];
  while(at<poster.length){const size=view.getUint32(at);types.push(String.fromCharCode(...poster.subarray(at+4,at+8)));at+=12+size;}
  assert.ok(types.includes('IDAT'));assert.equal(types.at(-1),'IEND');assert.ok(!types.some(x=>['acTL','fcTL','fdAT'].includes(x)));
  assert.match(await assets.get(FLUENT_CREDIT_PATH).text(),/Copyright \(c\) Microsoft Corporation/);
  const corrupt=new Uint8Array(body);corrupt[100]^=1;assert.throws(()=>fluentStaticPoster(corrupt),/checksum/);
  body=corrupt;await assert.rejects(downloadFluentEmoji(item),/integrity/);
  body=new Uint8Array([1,2]);await assert.rejects(downloadFluentEmoji(item),/Incomplete/);
  globalThis.fetch=async()=>new Response('too big',{headers:{'content-length':String(3*1024*1024)}});await assert.rejects(downloadFluentEmoji(item),/size limit/);
  await assert.rejects(downloadFluentEmoji({token:'https://evil.test'}),/Unknown/);
  const controller=new AbortController();controller.abort();globalThis.fetch=async(_url,{signal})=>{signal.throwIfAborted();};await assert.rejects(downloadFluentEmoji(item,controller.signal),e=>e.name==='AbortError');
  assert.throws(()=>fluentStaticPoster(new Uint8Array(20)),/invalid PNG/);
 }finally{globalThis.fetch=original;}
});

test('mixed styles retain independent tokens, assets and credits through backup; incomplete caches preserve Fluent outbox assets',async()=>{
 const item=getFluentEmoji(':fluent_1f44d_1f3fb:'),doc=empty(),bytes=await fixture('1f44d_1f3fb');
 const assets=new Map([['emoji/'+item.fileName,new Blob([bytes],{type:'image/png'})],[fluentPosterPath(item),new Blob([fluentStaticPoster(bytes)],{type:'image/png'})],[FLUENT_CREDIT_PATH,new Blob([FLUENT_CREDIT],{type:'text/plain'})]]);
 doc.tables.bullets=[insertEmoji(bullet('a',{text:':noto_1f600: '}),item.token)];doc.tables.emojis=[{token:item.token,fileName:item.fileName,label:item.label}];
 assert.equal(references(doc).size,3);const backup=await parseArchive(await archive(doc,assets));assert.equal(backup.doc.tables.bullets[0].text,doc.tables.bullets[0].text);
 for(const [path,blob] of assets)assert.deepEqual(await backup.assets.get(path).arrayBuffer(),await blob.arrayBuffer());
 assert.ok(androidBlockers(doc).some(x=>x.includes('Fluent')));await assert.rejects(archive(doc,assets,true),/full web backup/);
 const missing=new Map(assets);missing.delete(fluentPosterPath(item));await assert.rejects(archive(doc,missing),/Missing attachment/);
 const manifest=[...assets].map(([path,blob],i)=>({path,hash:String(i),size:blob.size,type:blob.type}));
 const y=seed(doc,manifest),state=sharedState(y);y.destroy();const meta=initializeOutbox(state,1,null,doc,[]);stageAssets(meta,[]);
 let shared=openShared(meta.localState);assert.deepEqual(project(shared).assets,manifest.sort((a,b)=>a.path.localeCompare(b.path)));shared.destroy();assert.equal(meta.pending.length,0);
 const removed=structuredClone(doc);removed.tables.emojis=[];recordLocal(meta,removed);stageAssets(meta,[]);shared=openShared(meta.localState);assert.deepEqual(project(shared).assets,[]);shared.destroy();
});
