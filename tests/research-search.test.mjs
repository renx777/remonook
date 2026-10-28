import test from 'node:test';
import assert from 'node:assert/strict';
import {researchSearch,parseSearchFeed,searchTopic,boundedText} from '../cloud/research-worker.mjs';
const item=(title,text,url)=>`<item><title>${title}</title><description>${text}</description><link>${url}</link></item>`;
const feed=items=>'<rss><channel>'+items.join('')+'</channel></rss>';
const call=(body,extra={})=>new Request('https://staging.remonook.com/api/research/search',{method:'POST',headers:{'Content-Type':'application/json',...extra.headers},body:JSON.stringify(body)});
const sample=feed([item('Supervised learning','Supervised learning tasks include classification and regression.','https://example.com/learning'),item('Unrelated','A recipe for soup.','https://example.com/soup')]);
test('fetches excerpts without a key, bounds queries and returns safe related results',async()=>{
 let requests=0;
 const response=await researchSearch(call({query:'What are the types of Supervised Learning?'}),async(url,options)=>{requests++;assert.equal(url.origin,'https://www.bing.com');assert.equal(url.searchParams.get('q'),'"Supervised Learning"');assert.equal(options.headers.Accept,'application/rss+xml, application/xml');return new Response(sample);});
 assert.equal(response.status,200);assert.equal(requests,1);assert.equal(response.headers.get('Cache-Control'),'no-store');
 const data=await response.json();assert.equal(data.provider,'Bing');assert.equal(data.results.length,1);assert.match(data.results[0].text,/classification and regression/);
 for(const query of ['',null,'x'.repeat(1001)])assert.equal((await researchSearch(call({query}),()=>{throw Error('must not fetch');})).status,400);
 assert.equal((await researchSearch(call({query:'topic'},{headers:{Origin:'https://other.example'}}))).status,403);
 assert.equal((await researchSearch(new Request('https://test/api/research/search'))).status,405);
});
test('provider failures and empty matches stay honest and never fabricate answers',async()=>{
 const unavailable=await researchSearch(call({query:'topic'}),async()=>new Response('blocked',{status:429}));assert.equal(unavailable.status,502);assert.match((await unavailable.json()).error,/unavailable/);
 const challenge=await researchSearch(call({query:'topic'}),async()=>new Response('<html>CAPTCHA</html>'));assert.equal(challenge.status,502);
 const empty=await researchSearch(call({query:'topic'}),async()=>new Response(feed([])));assert.deepEqual((await empty.json()).results,[]);
 const timeout=await researchSearch(call({query:'topic'}),async()=>{throw new DOMException('Timeout','TimeoutError');});assert.equal(timeout.status,502);
 await assert.rejects(()=>boundedText(new Response('x'.repeat(100)),20),/too large/);
});
test('feed parsing decodes text, deduplicates and rejects executable URLs',()=>{
 const xml=feed([item('Topic &amp; details','<![CDATA[<b>Topic</b> details &amp; examples]]>','https://example.com/topic'),item('Topic duplicate','Topic repeated','https://example.com/topic'),item('Topic script','Topic example','javascript:alert(1)')]);
 const results=parseSearchFeed(xml,'topic');assert.equal(results.length,1);assert.equal(results[0].title,'Topic & details');assert.equal(results[0].text,'Topic details & examples');
 assert.equal(searchTopic('What are the types of Supervised Learning?'),'Supervised Learning');
});
