import {socialPost} from '../src/social-posts.mjs';
import {redditPreview} from './reddit-preview.mjs';
export default {async fetch(request,env,ctx){
 const url=new URL(request.url);if(url.pathname!=='/api/reddit-preview')return env.ASSETS.fetch(request);
 const json=(body,status,ttl=0)=>Response.json(body,{status,headers:{'Cache-Control':ttl?'public, max-age='+ttl:'no-store','X-Content-Type-Options':'nosniff'}});
 if(request.method!=='GET')return json({error:'Method not allowed'},405);
 const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return json({error:'Same-origin requests only'},403);
 const value=url.searchParams.get('url')||'';if(value.length>4096)return json({error:'Invalid URL'},400);
 // No cookies or authorization are forwarded. Cached responses contain public post text only.
 const post=socialPost(value);if(post?.kind!=='reddit')return json({error:'Use a Reddit post link'},400);
 const identity=post.short?post.href:post.postId+':'+(post.commentId||'');
 const key=new Request(url.origin+'/api/reddit-preview?v=2&post='+encodeURIComponent(identity));
 const cache=globalThis.caches?.default,hit=cache&&await cache.match(key);if(hit)return hit;
 try{const response=json(await redditPreview(value),200,300);if(cache)ctx.waitUntil(cache.put(key,response.clone()).catch(()=>{}));return response;}
 catch(error){const response=json({error:'Reddit has not made this public preview available. Open the original post.',code:error.code||'REDDIT_PREVIEW_UNAVAILABLE',providerStatus:error.upstreamStatus||null},422,30);if(cache)ctx.waitUntil(cache.put(key,response.clone()).catch(()=>{}));return response;}
}};
