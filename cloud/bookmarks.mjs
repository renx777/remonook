import {extractArticle} from './article-extract.mjs';
export async function bookmarksRoute(request,env,uid,{readLimited}){
 if(new URL(request.url).pathname!=='/bookmarks/capture'||request.method!=='POST')return new Response('Not found',{status:404});
 const body=JSON.parse(new TextDecoder().decode(await readLimited(request,8192)));
 if(!env.ARTICLE_CAPTURE||!env.ARTICLE_RATE_LIMITER)throw Object.assign(Error('Article capture is awaiting server activation. Your bookmark is saved.'),{status:503});
 if(!(await env.ARTICLE_RATE_LIMITER.limit({key:uid})).success)throw Object.assign(Error('Too many capture requests. Try again shortly.'),{status:429});
 const response=await env.ARTICLE_CAPTURE.fetch(new Request('https://capture.internal/',{method:'POST',body:JSON.stringify({url:body.url})}));if(!response.ok)throw Object.assign(Error('Reader unavailable for this page. Your bookmark is saved.'),{status:422});const article=await response.json();return Response.json(article,{headers:{'Cache-Control':'private, no-store'}});
}
