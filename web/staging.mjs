import {linkPreview,previewUrl} from './link-preview.mjs';
import {socialPost} from '../src/social-posts.mjs';
import {redditPreview} from './reddit-preview.mjs';
export default {async fetch(request,env,ctx){
 const url=new URL(request.url);if(url.pathname==='/api/link-preview')return handleLinkPreview(request,env,ctx);if(url.pathname!=='/api/reddit-preview')return env.ASSETS.fetch(request);
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

async function handleLinkPreview(request,env,ctx){
 const url=new URL(request.url),json=(body,status,ttl=0)=>Response.json(body,{status,headers:{'Cache-Control':ttl?'public, max-age='+ttl:'no-store','X-Content-Type-Options':'nosniff',...(status===429?{'Retry-After':'60'}:{})}});
 if(request.method!=='GET')return json({error:'Method not allowed.'},405);
 const origin=request.headers.get('Origin'),site=request.headers.get('Sec-Fetch-Site');
 if(origin&&origin!==url.origin||site==='cross-site')return json({error:'Same-origin requests only.'},403);
 if(env.LINK_PREVIEW_LIMITER){const {success}=await env.LINK_PREVIEW_LIMITER.limit({key:'preview:'+request.headers.get('CF-Connecting-IP')});if(!success)return json({error:'Too many previews. Try again shortly.'},429);}
 let target;try{target=previewUrl(url.searchParams.get('url')||'');}catch{return json({error:'Use a public website link without private credentials.'},400);}
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(target.href))),b=>b.toString(16).padStart(2,'0')).join('');
 const key=new Request(url.origin+'/api/link-preview?v=2&key='+hash),cache=globalThis.caches?.default;
 const hit=cache&&await cache.match(key);if(hit)return hit;
 try{const result=await linkPreview(target.href),response=json(result,200,3600);if(cache)ctx.waitUntil(cache.put(key,response.clone()).catch(()=>{}));return response;}
 catch(error){const response=json({error:'Preview unavailable. Your original link is kept.',code:error.code==='UPSTREAM_UNAVAILABLE'?'UPSTREAM_UNAVAILABLE':'PREVIEW_UNAVAILABLE',providerStatus:Number.isInteger(error.upstreamStatus)?error.upstreamStatus:null},422,30);if(cache)ctx.waitUntil(cache.put(key,response.clone()).catch(()=>{}));return response;}
}
