import {previewUrl} from './public-preview-url.mjs';
import {desktopInvoke,isApp} from './desktop';
// The website asks its same-origin Worker. The apps have no such origin (a relative
// /api path returns the app's own index.html), so they read the page natively.
async function webPreview(key:string,signal:AbortSignal){const r=await fetch('/api/link-preview?url='+encodeURIComponent(key),{credentials:'omit',signal});if(!r.ok)throw Error(r.status===429?'Preview limit reached. Try again shortly.':'Preview unavailable.');if(!/json/i.test(r.headers.get('content-type')||''))throw Error('Preview unavailable.');return r.json();}
async function appPreview(key:string){const page=await desktopInvoke<{url:string;html:string}>('link_preview_fetch',{url:key});const {documentPreview}=await import('../web/link-preview.mjs');return documentPreview(new DOMParser().parseFromString(page.html,'text/html'),page.url);}
export type LinkMetadata={schema:1;url:string;site:string;title:string;description:string;image:string|null;kind:'product'|'page';brand:string|null;price:{amount:string;currency:string;from:boolean}|null;availability:string|null;rating:{value:number;best:number;count:number|null}|null;capturedAt:number};
const cache=new Map<string,{expires:number;value?:LinkMetadata;promise?:Promise<LinkMetadata>}>();
let running=0;const queue:Array<()=>void>=[];
async function slot<T>(work:()=>Promise<T>):Promise<T>{if(running>=3)await new Promise<void>(resolve=>queue.push(resolve));else running++;try{return await work();}finally{const next=queue.shift();if(next)next();else running--;}}
export function validateLinkMetadata(value:any):LinkMetadata{
 if(value?.schema!==1||typeof value.title!=='string'||!value.title.trim()||value.title.length>250||typeof value.site!=='string'||value.site.length>100||typeof value.description!=='string'||value.description.length>360||!Number.isFinite(value.capturedAt))throw Error('Preview unavailable.');
 const url=previewUrl(value.url).href;let image=null;try{image=value.image?previewUrl(value.image).href:null;}catch{}
 const price=value.price&&/^\d{1,12}(?:\.\d{1,6})?$/.test(value.price.amount)&&/^[A-Z]{3}$/.test(value.price.currency)?{amount:String(value.price.amount),currency:value.price.currency,from:value.price.from===true}:null;
 const r=value.rating,rating=r&&Number.isFinite(r.value)&&Number.isFinite(r.best)&&r.value>=0&&r.best>0&&r.value<=r.best?{value:r.value,best:r.best,count:Number.isSafeInteger(r.count)&&r.count>0?r.count:null}:null;
 return {...value,url,image,price,rating,kind:value.kind==='product'?'product':'page',availability:typeof value.availability==='string'?value.availability.slice(0,80):null,brand:typeof value.brand==='string'?value.brand.slice(0,80):null};
}
export function loadLinkPreview(value:string):Promise<LinkMetadata>{
 let key:string;try{key=previewUrl(value).href;}catch{return Promise.reject(Error('Preview unavailable.'));}
 const prior=cache.get(key);if(prior?.promise&&prior.expires>Date.now())return prior.promise;
 const entry:{expires:number;value?:LinkMetadata;promise?:Promise<LinkMetadata>}={expires:Date.now()+3600000};
 entry.promise=slot(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{const value=validateLinkMetadata(isApp()?await appPreview(key):await webPreview(key,controller.signal));entry.value=value;return value;}catch(error){entry.expires=Date.now()+30000;throw error;}finally{clearTimeout(timer);}});
 cache.delete(key);cache.set(key,entry);if(cache.size>128)cache.delete(cache.keys().next().value!);return entry.promise;
}
export function previewPrice(value:LinkMetadata['price'],locale?:string){if(!value)return '';try{return (value.from?'From ':'')+new Intl.NumberFormat(locale,{style:'currency',currency:value.currency}).format(Number(value.amount));}catch{return value.currency+' '+value.amount;}}

export function invalidateLinkPreview(url:string){try{cache.delete(previewUrl(url).href);}catch{}}

export function cachedLinkPreview(url:string|null){if(!url)return null;try{const entry=cache.get(previewUrl(url).href);return entry&&entry.expires>Date.now()?entry.value||null:null;}catch{return null;}}
