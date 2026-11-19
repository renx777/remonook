import {decode} from 'html-entities';
const MAX_HTML=512*1024,MAX_SCRIPT=64*1024;
import {previewUrl,publicAddress,previewFetchUrl,previewRedirect} from '../src/public-preview-url.mjs';
export {previewUrl,publicAddress};
async function prefix(response,limit){
 const reader=response.body?.getReader();if(!reader)return '';let size=0;const chunks=[];
 try{while(size<limit){const {done,value}=await reader.read();if(done)break;const part=value.subarray(0,limit-size);chunks.push(part);size+=part.length;if(size===limit){await reader.cancel();break;}}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.length;}return new TextDecoder().decode(bytes);
}
export async function checkPublicHost(host,fetcher,signal){
 const answers=await Promise.all(['A','AAAA'].map(async type=>{const url=new URL('https://cloudflare-dns.com/dns-query');url.searchParams.set('name',host);url.searchParams.set('type',type);const r=await fetcher(url.href,{redirect:'manual',signal,headers:{Accept:'application/dns-json'}});if(!r.ok)throw Error('Website could not be resolved.');const d=JSON.parse(await prefix(r,16384));if(d.Status!==0)throw Error('Website could not be resolved.');return (d.Answer||[]).filter(a=>a.type===1||a.type===28).map(a=>a.data);}));
 const ips=answers.flat();if(!ips.length||ips.some(ip=>!publicAddress(ip)))throw Error('Only public websites can be previewed.');
}
const clean=(value,max=500)=>typeof value==='string'?decode(decode(value)).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
function imageUrl(value,base){const raw=typeof value==='string'?value:value?.url||value?.contentUrl;if(!raw)return null;try{return previewUrl(new URL(decode(raw),base).href).href;}catch{return null;}}
const amount=value=>{const s=String(value??'').trim();return /^\d{1,12}(?:\.\d{1,6})?$/.test(s)&&Number(s)<1e12?s:null;};
const objects=value=>Array.isArray(value)?value:[value];
/** Only supplied structured data is shown. No inferred prices, ratings or stock. */
export function metadataPreview({meta={},title='',scripts=[]},base,now=Date.now()){
 const get=key=>meta[key.toLowerCase()]||'',url=previewUrl(base),todo=scripts.slice(0,12).flatMap(text=>{try{return objects(JSON.parse(text));}catch{return [];}});let product=null,seen=0;const products=[];
 while(todo.length&&seen++<1000){const node=todo.shift();if(!node||typeof node!=='object')continue;
  const types=objects(node['@type']).map(v=>String(v).replace(/^https?:\/\/schema.org\//,''));
  if(types.some(t=>['Product','ProductGroup'].includes(t)))products.push(node);
  for(const key of ['@graph','mainEntity'])if(node[key])todo.push(...objects(node[key]));
 }
 product=products.find(node=>{try{return new URL(node.url||node['@id'],url).pathname===url.pathname;}catch{return false;}})||(products.length===1?products[0]:null);
 let heading=clean(product?.name,250)||clean(get('amazon:title')||get('og:title')||get('twitter:title')||title,250);
 if(amazonPage(url))heading=heading.replace(/^Amazon\.[^:]+:\s*Buy\s*/i,'').replace(/\s+Online at.*$/i,'');
 if(!heading||/^(?:just a moment|access denied|robot check|captcha|pardon our interruption|attention required|are you a human)/i.test(heading)||/(?:select|choose) your (?:country|region)/i.test(heading))throw Error('This website has not made a public preview available.');
 const offers=objects(product?.offers).filter(o=>o&&typeof o==='object'),offer=offers.find(o=>amount(o.price)||amount(o.lowPrice))||offers[0]||{};
 const price=amount(offer.price??offer.lowPrice??(get('product:price:amount')||get('og:price:amount')));
 const currency=clean(offer.priceCurrency||get('product:price:currency')||get('og:price:currency'),3).toUpperCase();
 const stock=clean(offer.availability||get('product:availability'),80).split('/').pop();
 const availability=({InStock:'In stock',OutOfStock:'Out of stock',PreOrder:'Pre-order',PreSale:'Pre-sale',LimitedAvailability:'Limited availability',Discontinued:'Discontinued',SoldOut:'Sold out',OnlineOnly:'Online only',BackOrder:'Back order',in_stock:'In stock',out_of_stock:'Out of stock'})[stock]||null;
 const rating=product?.aggregateRating,value=Number(rating?.ratingValue),best=Number(rating?.bestRating||5),count=Number(rating?.reviewCount??rating?.ratingCount);
 return {schema:1,url:url.href,site:clean(get('og:site_name'),100)||url.hostname.replace(/^www\./,''),title:heading,description:clean(product?.description||get('og:description')||get('description')||get('twitter:description'),360),image:imageUrl(objects(product?.image)[0],url)||imageUrl(get('og:image:secure_url')||get('og:image')||get('twitter:image')||get('amazon:image')||get('image_src')||get('image'),url),kind:product||get('og:type')==='product'||get('amazon:image')?'product':'page',brand:clean(product?.brand?.name||product?.brand,80)||null,price:price&&/^[A-Z]{3}$/.test(currency)?{amount:price,currency,from:!amount(offer.price)&&!!amount(offer.lowPrice)}:null,availability,rating:Number.isFinite(value)&&value>=0&&Number.isFinite(best)&&best>0&&value<=best?{value,best,count:Number.isSafeInteger(count)&&count>0?count:null}:null,capturedAt:now};
}
function amazonPage(value){const url=new URL(value);return /(?:^|\.)amazon\.(?:com|in|co\.uk|de|fr|it|es|co\.jp|ca|com\.au|com\.br|com\.mx|nl|se|pl|com\.be|com\.tr|ae|sa|sg|eg)$/.test(url.hostname)&&/(?:\/dp\/|\/gp\/product\/)[A-Z0-9]{10}(?:[/?]|$)/i.test(url.pathname);}
function primaryImage(el){const hires=el.getAttribute('data-old-hires');if(hires)return hires;try{const images=JSON.parse(el.getAttribute('data-a-dynamic-image')||'{}'),best=Object.entries(images).sort((a,b)=>(b[1]?.[0]||0)*(b[1]?.[1]||0)-(a[1]?.[0]||0)*(a[1]?.[1]||0))[0];if(best)return best[0];}catch{}return el.getAttribute('src')||'';}
/** Reads preview fields from a parsed, inert document: local Vite (linkedom) and the
 apps (the webview's DOMParser, which never runs scripts or loads images). */
export function documentPreview(doc,url,now=Date.now()){
 const data={meta:{},title:'',scripts:[]};
 for(const el of Array.from(doc.querySelectorAll('meta')).slice(0,100)){const key=(el.getAttribute('property')||el.getAttribute('name')||el.getAttribute('itemprop')||'').toLowerCase();if(key&&!data.meta[key])data.meta[key]=(el.getAttribute('content')||'').slice(0,4096);}
 data.title=doc.querySelector('title')?.textContent.slice(0,512)||'';
 data.meta.image_src=doc.querySelector('link[rel="image_src"]')?.getAttribute('href')||'';
 if(amazonPage(url)){data.meta['amazon:title']=doc.querySelector('#productTitle')?.textContent.slice(0,512)||'';const image=doc.querySelector('img#landingImage,img#imgBlkFront');if(image)data.meta['amazon:image']=primaryImage(image);}
 data.scripts=Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).slice(0,12).map(el=>el.textContent).filter(text=>text.length<=MAX_SCRIPT);
 return metadataPreview(data,url,now);
}
/** HTMLRewriter parses bounded public HTML without executing page scripts. */
export async function readMetadata(response,url){
 const amazon=amazonPage(url),html=await prefix(response,amazon?MAX_HTML*2:MAX_HTML),data={meta:{},title:'',scripts:[]};let script=null;
 // Local Vite runs in Node; production uses Workers' native streaming parser.
 if(typeof HTMLRewriter==='undefined'){const {DOMParser}=await import('linkedom/worker');return documentPreview(new DOMParser().parseFromString(html,'text/html'),url);}
 const rewriter=new HTMLRewriter().on('meta',{element(el){const key=(el.getAttribute('property')||el.getAttribute('name')||el.getAttribute('itemprop')||'').toLowerCase();if(key&&Object.keys(data.meta).length<100&&!data.meta[key])data.meta[key]=(el.getAttribute('content')||'').slice(0,4096);}})
 .on('title',{text(chunk){if(data.title.length<512)data.title+=chunk.text.slice(0,512-data.title.length);}})
 .on('link[rel="image_src"]',{element(el){data.meta.image_src=el.getAttribute('href')||'';}})
 .on('#productTitle',{text(chunk){if(amazon){const previous=data.meta['amazon:title']||'';data.meta['amazon:title']=previous+chunk.text.slice(0,512-previous.length);}}})
 .on('img#landingImage,img#imgBlkFront',{element(el){if(amazon&&!data.meta['amazon:image'])data.meta['amazon:image']=primaryImage(el);}})
 .on('script[type="application/ld+json"]',{element(el){script=data.scripts.length<12?{text:''}:null;const current=script;el.onEndTag(()=>{if(current&&current.text.length<=MAX_SCRIPT)data.scripts.push(current.text);if(script===current)script=null;});},text(chunk){if(script&&script.text.length<=MAX_SCRIPT)script.text+=chunk.text.slice(0,MAX_SCRIPT+1-script.text.length);}});
 await rewriter.transform(new Response(html,{headers:{'Content-Type':'text/html'}})).arrayBuffer();return metadataPreview(data,url);
}
export async function linkPreview(value,{fetcher=fetch,resolveHost=checkPublicHost,timeout=9000}={}){
 let url=previewFetchUrl(value);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{for(let hop=0;hop<5;hop++){
  await resolveHost(url.hostname,fetcher,controller.signal);
  const r=await fetcher(url.href,{redirect:'manual',signal:controller.signal,headers:{Accept:'text/html,application/xhtml+xml','User-Agent':'RemoNookPreview/1.0 (+https://remonook.com/about)'}});
  if([301,302,303,307,308].includes(r.status)){const location=r.headers.get('location');await r.body?.cancel();if(!location)throw Error('Invalid redirect.');url=previewRedirect(location,url);continue;}
  if(!r.ok||!/(?:text\/html|application\/xhtml\+xml)/i.test(r.headers.get('content-type')||'')){await r.body?.cancel();throw Object.assign(Error('This website has not made a public preview available.'),{code:'UPSTREAM_UNAVAILABLE',upstreamStatus:r.status});}
  return await readMetadata(r,url.href);
 }throw Error('Too many redirects.');}finally{clearTimeout(timer);}
}
