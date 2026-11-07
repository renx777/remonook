// Search excerpts only: no model, page proxy, private workspace access, or API key.
const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(message,status=502)=>{throw Object.assign(Error(message),{status});};
export async function boundedText(response,limit){
 const reader=response.body?.getReader();if(!reader)return '';
 const chunks=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();fail('Search response was too large. Try a shorter query.',502);}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return new TextDecoder().decode(bytes);
}
const decode=text=>text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&#(x[\da-f]+|\d+);|&(amp|lt|gt|quot|apos|nbsp);/gi,(match,namedOrNumber,named)=>{if(named)return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[named.toLowerCase()];const n=namedOrNumber[0].toLowerCase()==='x'?parseInt(namedOrNumber.slice(1),16):Number(namedOrNumber);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';});
const plain=text=>decode(decode(text)).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
export function searchTopic(query){
 // Focus the feed on the subject rather than common question words.
 return query.trim().replace(/[?？]+$/,'').replace(/^(?:what|which)\s+(?:is|are|was|were)\s+(?:the\s+)?(?:(?:different\s+)?(?:types|kinds|categories|examples|definition|meaning)\s+of\s+)?/i,'').replace(/^(?:define|explain|describe)\s+/i,'').trim();
}
export function parseSearchFeed(xml,query){
 if(!/<rss\b/i.test(xml))fail('The search service is temporarily unavailable. Please try again.');
 const keywords=searchTopic(query).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[];
 const meaningful=keywords.filter(w=>!['the','and','for','with','how','does','why','can','you','that','this','from'].includes(w));
 const results=[],seen=new Set();
 for(const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)){
  const tag=name=>match[1].match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'))?.[1]||'';
  const title=plain(tag('title')).slice(0,240),text=plain(tag('description')).slice(0,1800),raw=decode(tag('link')).trim();
  let url;try{url=new URL(raw);}catch{continue;}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!title||!text||seen.has(url.href))continue;
  // An excerpt must mention the subject; never fill the panel with unrelated results.
  const content=(title+' '+text).toLowerCase(),hits=meaningful.filter(word=>content.includes(word)).length;
  if(meaningful.length&&hits<Math.min(2,meaningful.length))continue;
  const listAnswer=/\b(types|kinds|categories)\b/i.test(query)&&/\b(such as|include|categories|types|classified|divided)\b/i.test(text);
  seen.add(url.href);results.push({title,text,url:url.href,source:url.hostname.replace(/^www\./,''),score:hits+(listAnswer?2:0)});
 }
 return results.sort((a,b)=>b.score-a.score).slice(0,6).map(({score,...result})=>result);
}
export async function researchSearch(request,fetcher=fetch){
 if(request.method!=='POST')return reply({error:'Use POST to search.'},405);
 if(request.headers.get('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin)return reply({error:'Origin not allowed.'},403);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({error:'Send a JSON search query.'},415);
 try{
  if(Number(request.headers.get('Content-Length'))>4096)return reply({error:'Search query is too long.'},400);
  let value;try{value=JSON.parse(await boundedText(request,4096));}catch{return reply({error:'Enter a valid search query.'},400);}
  if(typeof value?.query!=='string'||!value.query.trim()||value.query.length>1000)return reply({error:'Enter a query between 1 and 1000 characters.'},400);
  const query=value.query.trim(),topic=searchTopic(query);if(!topic)return reply({query,results:[],provider:'Bing'});
  const target=new URL('https://www.bing.com/search');target.searchParams.set('format','rss');target.searchParams.set('q','"'+topic.replace(/"/g,'')+'"');
  const response=await fetcher(target,{headers:{Accept:'application/rss+xml, application/xml'},signal:AbortSignal.any([request.signal,AbortSignal.timeout(10000)])});
  if(!response.ok)fail('Search is temporarily unavailable. Please try again.');
  const results=parseSearchFeed(await boundedText(response,160000),query);
  return reply({query,results,provider:'Bing'});
 }catch(error){return reply({error:error.status?error.message:'Search could not be reached. Please try again.'},error.status||502);}
}
