import {XMLParser} from 'fast-xml-parser';
import {decode} from 'html-entities';
import {socialPost} from '../src/social-posts.mjs';
const plain=value=>decode(String(value||'').replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<\/(p|div|li|blockquote)>|<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'')).replace(/\n\s*\n+/g,'\n\n').trim();
async function bounded(response){if(!response.ok)throw Error('Unavailable');const reader=response.body.getReader();let size=0,parts=[];try{for(;;){const{value,done}=await reader.read();if(done)break;size+=value.length;if(size>256*1024)throw Error('Too large');parts.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return new TextDecoder().decode(bytes);}finally{await reader.cancel().catch(()=>{});}}
export function parseRedditFeed(xml,post){
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Invalid feed');
 const data=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'',parseTagValue:false,processEntities:true}).parse(xml);
 const entries=[data.feed?.entry||[]].flat(),expected=(post.commentId?'t1_':'t3_')+(post.commentId||post.postId);
 const entry=entries.find(e=>String(e.id||'').endsWith(':'+expected)||String(e.id||'')===expected);if(!entry)throw Error('Post unavailable');
 const content=typeof entry.content==='string'?entry.content:entry.content?.['#text'];const text=plain(content).replace(/\n\s*submitted by[^\n]*?\[link\]\s*\[comments\]\s*$/i,'').replace(/\[link\]\s*\[comments\]\s*$/i,'').trim();
 if(/^\[(?:removed|deleted)\]$/i.test(text))throw Error('Post unavailable');
 return {schema:1,url:post.href,title:plain(entry.title).slice(0,500),author:plain(entry.author?.name).slice(0,100),community:plain(entry.category?.label).slice(0,100),text:text.slice(0,6000),truncated:text.length>6000,source:'Reddit public RSS'};
}
export async function redditPreview(value,{fetcher=fetch}={}){
 let post=socialPost(value);if(post?.kind!=='reddit')throw Error('Invalid Reddit URL');
 const signal=AbortSignal.timeout(10000),headers={'User-Agent':'RemoNook/1.0 (public post preview; https://remonook.com)','Accept':'application/atom+xml'};
 if(post.short){let next=post.href;for(let i=0;i<4;i++){const r=await fetcher(next,{method:'HEAD',redirect:'manual',headers,signal});const loc=r.headers.get('Location');await r.body?.cancel();if(!loc)break;const url=new URL(loc,next);if(url.protocol!=='https:'||!['www.reddit.com','reddit.com'].includes(url.hostname)||url.username||url.password||url.port)throw Error('Invalid redirect');next=url.href;const resolved=socialPost(next);if(resolved?.kind==='reddit'&&!resolved.short){post=resolved;break;}}if(post.short)throw Error('Short link unavailable');}
 const feed='https://www.reddit.com/comments/'+post.postId+(post.commentId?'/_/'+post.commentId:'')+'/.rss?limit=1';
 return parseRedditFeed(await bounded(await fetcher(feed,{headers,redirect:'error',signal})),post);
}
