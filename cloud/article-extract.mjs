import {prepareImages,embedImages} from './article-images.mjs';
import {Readability} from '@mozilla/readability';
import {DOMParser} from 'linkedom/worker';
export function publicUrl(value){const u=new URL(value),h=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port)||!h.includes('.')||h.endsWith('.local')||h.endsWith('.internal')||h.endsWith('.localhost')||h==='localhost'||/^[\d.]+$/.test(h)||h.includes(':'))throw Error('Only public website addresses are supported.');u.hash='';return u;}
export async function extractArticle(value,fetcher=fetch){
 let url=publicUrl(value),response;const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
 try{
  for(let i=0;i<5;i++){response=await fetcher(url.href,{redirect:'manual',signal:controller.signal,headers:{Accept:'text/html'}});if(response.status>=300&&response.status<400){const target=response.headers.get('location');await response.body?.cancel();if(!target)throw Error('The page redirected without an address.');url=publicUrl(new URL(target,url).href);continue;}break;}
  if(!response?.ok||!response.headers.get('content-type')?.includes('text/html'))throw Error('Reader unavailable for this page. Open the original or try again.');
  const reader=response.body.getReader(),chunks=[];let size=0;try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>5*1024*1024){await reader.cancel();throw Error('This page is too large for reader mode.');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
  const document=new DOMParser().parseFromString(new TextDecoder().decode(bytes),'text/html');
  const hero=document.querySelector('meta[property="og:image"],meta[name="twitter:image"]')?.getAttribute('content');
  prepareImages(document,url,publicUrl);
  for(const element of document.querySelectorAll('script,style,iframe,object,embed,form,base,link,meta[http-equiv]'))element.remove();
  for(const element of document.querySelectorAll('[href],[src]'))for(const attr of ['href','src'])if(element.hasAttribute(attr)){try{if(attr==='src'&&/^data:image\/(png|jpeg|webp|gif|avif);base64,[a-z0-9+/=]+$/i.test(element.getAttribute(attr)))continue;const target=publicUrl(new URL(element.getAttribute(attr),url).href);element.setAttribute(attr,target.href);}catch{element.removeAttribute(attr);}}
  const article=new Readability(document,{charThreshold:100,maxElemsToParse:30000}).parse();if(!article?.textContent?.trim()||article.textContent.length<100)throw Error('No readable article found. Your bookmark is still saved.');
  const clean=new DOMParser().parseFromString('<html><body>'+article.content+'</body></html>','text/html');
  // Share images often carry an article's lead image outside Readability's prose container.
  if(hero&&(!clean.querySelector('img')||article.content.indexOf('<img')>800)){try{const src=publicUrl(new URL(hero,url).href).href;if(!Array.from(clean.querySelectorAll('img')).some(img=>{const value=img.getAttribute('src');if(value===src)return true;try{const stem=new URL(value).pathname.split('/').pop().replace(/\.(png|jpe?g|webp|gif|avif)$/i,'');return stem.length>12&&new URL(src).pathname.split('/').some(part=>part.replace(/\.(png|jpe?g|webp|gif|avif)$/i,'')===stem);}catch{return false;}})){const figure=clean.createElement('figure'),img=clean.createElement('img');img.setAttribute('src',src);img.setAttribute('alt',article.title||'Article image');figure.append(img);clean.body.prepend(figure);}}catch{}}
  const result={schema:1,url:url.href,title:(article.title||url.hostname).slice(0,1000),byline:article.byline||'',excerpt:(article.excerpt||'').slice(0,500),html:clean.body.innerHTML,text:article.textContent,capturedAt:Date.now(),captureVersion:2};
  const baseBytes=new TextEncoder().encode(JSON.stringify(result)).length;
  if(baseBytes>1900*1024)throw Error('This article is too large for a saved copy.');
  const imageBudget=Math.max(0,Math.min(1024*1024,Math.floor((2*1024*1024-baseBytes-32768)*.7)));
  const stats=await embedImages(clean,url.href,fetcher,controller.signal,publicUrl,imageBudget);result.html=clean.body.innerHTML;result.imageCount=stats.embedded;
  if(new TextEncoder().encode(JSON.stringify(result)).length>2*1024*1024)throw Error('This article is too large for a saved copy.');
  return result;
 }finally{clearTimeout(timeout);}
}
