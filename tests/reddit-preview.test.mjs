import test from 'node:test';import assert from 'node:assert/strict';
import{redditPreview,parseRedditFeed}from'../web/reddit-preview.mjs';import worker from'../web/staging.mjs';import{socialPost}from'../src/social-posts.mjs';
const url='https://www.reddit.com/r/test/comments/abc123/a_post/',post=socialPost(url);
const feed=(id='t3_abc123',text='&lt;p&gt;A useful post&lt;/p&gt;')=>`<feed><entry><id>${id}</id><title>A post</title><author><name>/u/writer</name></author><category label="r/test"/><content type="html">${text}</content></entry></feed>`;
test('public feeds select the requested entry and render only bounded plain text',()=>{
 const p=parseRedditFeed(feed(),post);assert.equal(p.author,'/u/writer');assert.equal(p.text,'A useful post');assert.equal(p.url,url);
 assert.throws(()=>parseRedditFeed(feed('t1_wrong'),post));assert.throws(()=>parseRedditFeed('<!DOCTYPE x>'+feed(),post));assert.throws(()=>parseRedditFeed(feed('t3_abc123','[removed]'),post));
 assert(!parseRedditFeed(feed('t3_abc123','&lt;script&gt;alert(1)&lt;/script&gt;&lt;p&gt;safe&lt;/p&gt;'),post).text.includes('alert'));
});
test('fetches only fixed public Reddit feeds with no incoming cookies and bounded redirects',async()=>{
 let seen=[];const p=await redditPreview(url,{fetcher:async(u,o)=>{seen.push(u);assert(!o.headers.Cookie);assert(!o.headers.Authorization);return new Response(feed());}});assert.equal(p.title,'A post');assert.equal(seen[0],'https://www.reddit.com/comments/abc123/.rss?limit=1');
 await assert.rejects(()=>redditPreview('http://localhost/private',{fetcher:async()=>{throw Error('must not fetch');}}));
 await assert.rejects(()=>redditPreview('https://reddit.com/r/test/s/token',{fetcher:async()=>new Response(null,{status:302,headers:{Location:'http://127.0.0.1/secret'}})}));
 const resolved=await redditPreview('https://reddit.com/r/test/s/token',{fetcher:async(u,o)=>String(u).includes('/s/')?new Response(null,{status:302,headers:{Location:url}}):new Response(feed())});assert.equal(resolved.url,url);
 await assert.rejects(()=>redditPreview(url,{fetcher:async()=>new Response('x'.repeat(256*1024+1))}));
});
test('staging route isolates static assets, rejects writes and cross-origin fetches, and returns honest errors',async()=>{
 const env={ASSETS:{fetch:async()=>new Response('asset')}},ctx={waitUntil(){}};
 assert.equal(await(await worker.fetch(new Request('https://app.test/notes'),env,ctx)).text(),'asset');
 assert.equal((await worker.fetch(new Request('https://app.test/api/reddit-preview',{method:'POST'}),env,ctx)).status,405);
 assert.equal((await worker.fetch(new Request('https://app.test/api/reddit-preview',{headers:{Origin:'https://evil.test'}}),env,ctx)).status,403);
 assert.equal((await worker.fetch(new Request('https://app.test/api/reddit-preview?url=javascript:bad'),env,ctx)).status,400);
});
