import {useContext} from 'react';
import {GalleryContext} from './Gallery';
import {cardDetails} from './card-details.mjs';
import {CardDetailsButton} from './CardDetailsDialog';
import {useEffect,useRef,useState} from 'react';
import {ExternalLink,Link2,RefreshCw} from 'lucide-react';
import {loadLinkPreview,invalidateLinkPreview,cachedLinkPreview,previewPrice,type LinkMetadata} from './link-preview-client';
import './link-preview.css';
export function useLinkPreview(url:string|null){
 const [state,setState]=useState<{url:string|null;data:LinkMetadata|null;error:string;loading:boolean}>({url:null,data:null,error:'',loading:false}),[attempt,setAttempt]=useState(0),root=useRef<HTMLDivElement>(null),[near,setNear]=useState(false);
 useEffect(()=>{const el=root.current;if(!el||near)return;if(typeof IntersectionObserver==='undefined'){setNear(true);return;}const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setNear(true);observer.disconnect();}},{rootMargin:'160px'});observer.observe(el);return()=>observer.disconnect();},[near]);
 useEffect(()=>{if(!url||!near)return;const cached=cachedLinkPreview(url);if(cached){setState({url,data:cached,error:'',loading:false});return;}let live=true;setState({url,data:null,error:'',loading:true});const timer=setTimeout(()=>{loadLinkPreview(url).then(data=>{if(live)setState({url,data,error:'',loading:false});},error=>{if(live)setState({url,data:null,error:error instanceof Error?error.message:'Preview unavailable.',loading:false});});},220);return()=>{live=false;clearTimeout(timer);};},[url,near,attempt]);
 useEffect(()=>{const online=()=>{if(url&&!cachedLinkPreview(url)){invalidateLinkPreview(url);setAttempt(v=>v+1);}};window.addEventListener('online',online);return()=>window.removeEventListener('online',online);},[url]);
 const cached=cachedLinkPreview(url),current=cached?{url,data:cached,error:'',loading:false}:state.url===url?state:{url,data:null,error:'',loading:!!url};
 return {...current,root,retry:()=>{if(url)invalidateLinkPreview(url);setAttempt(v=>v+1);}};
}
// TMDB serves the same poster at several widths; let the browser pick the smallest that stays sharp.
const TMDB=/^(https:\/\/image\.tmdb\.org\/t\/p\/)(w\d+|original)(\/[\w.-]+)$/;
const tmdbOnly=(src:string)=>{const m=src.match(TMDB);return m?['w185 185w','w342 342w','w500 500w','w780 780w'].map(x=>m[1]+x.split(' ')[0]+m[3]+' '+x.split(' ')[1]).join(', '):undefined;};
// IMDb/Amazon posters ("…@._V1_.jpg") accept a width such as "._V1_SX300.jpg".
const AMAZON=/^(https:\/\/m\.media-amazon\.com\/images\/M\/[^/]+?\._V1_)(?:[A-Z]{2}\d+[^.]*)?(\.jpg)$/;
export const tmdbSrcSet=(src:string)=>{const a=src.match(AMAZON);if(a)return [200,320,480,720].map(w=>`${a[1]}SX${w}${a[2]} ${w}w`).join(', ');return tmdbOnly(src);};
export function PreviewImage({src,title,onUnavailable,sizes}:{src:string|null|undefined;title:string;onUnavailable?:()=>void;sizes?:string}){const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[src]);return src&&!failed?<img src={src} srcSet={tmdbSrcSet(src)} sizes={tmdbSrcSet(src)?sizes||'240px':undefined} alt={title} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>{setFailed(true);onUnavailable?.();}}/>:<span className="link-preview-placeholder" aria-hidden="true"><Link2 size={22}/></span>;}
export function LinkPreview({url,nodeId}:{url:string;nodeId?:string}){
 const {root,data,error,loading,retry}=useLinkPreview(url),context=useContext(GalleryContext),details=context&&nodeId?cardDetails(context.doc,nodeId,url):null;
 const title=details?.title||data?.title,image=details?.image||data?.image,description=details?.description||data?.description,price=details?.amount?{amount:details.amount,currency:details.currency,from:false}:data?.price;let host='Website';try{host=new URL(url).hostname.replace(/^www\./,'');}catch{}
 return <div ref={root} className="link-preview" onPointerDown={e=>e.stopPropagation()}>
  {image&&<a className="link-preview-image" href={url} target="_blank" rel="noopener noreferrer"><PreviewImage src={image} title={title||host}/></a>}
  <div className="link-preview-body"><span className="link-preview-site">{data?.site||host}</span><a className="link-preview-title" href={url} target="_blank" rel="noopener noreferrer">{title||host}</a>{description&&<p>{description}</p>}
   {(price||data?.availability)&&<div className="link-preview-facts"><strong>{previewPrice(price||null)}</strong>{data?.availability&&<span>{data.availability}</span>}</div>}
   {data?.rating&&<small>{data.rating.value} / {data.rating.best}{data.rating.count?' · '+data.rating.count.toLocaleString()+' ratings':''}</small>}
   {loading&&<small role="status">Loading preview…</small>}{error&&!details&&<small role="status">{error} Your link is kept.</small>}
   <footer><a href={url} target="_blank" rel="noopener noreferrer">Open website <ExternalLink size={12}/></a>{details&&<span>Your details{details.amount?' · entered price':''}</span>}{price&&!details?.amount&&<span title={data?new Date(data.capturedAt).toLocaleString():undefined}>Page preview · prices may change</span>}{nodeId&&<CardDetailsButton nodeId={nodeId} url={url} label={title||host}/>}{error&&<button type="button" onClick={retry} aria-label="Retry link preview"><RefreshCw size={13}/></button>}</footer>
  </div>
 </div>;
}
