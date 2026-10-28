import {useEffect,useState} from 'react';
import {AnimatedEmoji,useEmojiLibrary} from './AnimatedEmoji';
import {catalogAssetUrl,catalogPosterPath,getCatalogEmoji,isCatalogEmoji} from './emoji-catalog.mjs';
import {loadEmojiPreview} from './emoji-preview-cache.mjs';
import type {RecordData} from './data';

function useBlobUrl(blob?:Blob){
 const [value,setValue]=useState<{blob:Blob;url:string}|null>(null);
 useEffect(()=>{if(!blob||typeof URL.createObjectURL!=='function'){setValue(null);return;}const url=URL.createObjectURL(blob);setValue({blob,url});return()=>URL.revokeObjectURL(url);},[blob]);
 return value?.blob===blob?value?.url||'':'';
}
export function EmojiThumbnail({item,hidden=false}:{item:RecordData;hidden?:boolean}){
 const {assets}=useEmojiLibrary(),known=getCatalogEmoji(item.token);
 const local=useBlobUrl(isCatalogEmoji(item)?assets.get(catalogPosterPath(item)):undefined);
 const src=local||(known?catalogAssetUrl(known,true):'');
 const [failed,setFailed]=useState(false),[loadedSrc,setLoadedSrc]=useState('');
 const ready=!!src&&loadedSrc===src&&!failed;
 useEffect(()=>setFailed(false),[src]);
 return <span className="inline-emoji-thumbnail" style={{visibility:hidden?'hidden':undefined}} aria-hidden={hidden||undefined} data-emoji-token={item.token} role="img" aria-label={item.label}>
  <span className="inline-emoji-fallback" style={{visibility:ready?'hidden':undefined}}>{item.fallback||known?.fallback||'◈'}</span>
  {src&&!failed&&<img key={src} src={src} style={{opacity:ready?1:0}} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onLoad={()=>setLoadedSrc(src)} onError={()=>setFailed(true)}/>}
 </span>;
}
export function InlineEmojiPreview({item}:{item:RecordData}){
 const {assets,animate}=useEmojiLibrary();
 const [allowed,setAllowed]=useState(false),[animation,setAnimation]=useState<Blob>(),[state,setState]=useState(''),[loadedUrl,setLoadedUrl]=useState('');
 useEffect(()=>{
  const media=window.matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setAllowed(animate&&!media.matches&&!document.hidden);
  update();media.addEventListener?.('change',update);document.addEventListener('visibilitychange',update);
  return()=>{media.removeEventListener?.('change',update);document.removeEventListener('visibilitychange',update);};
 },[animate]);
 useEffect(()=>{
  setAnimation(undefined);setState('');if(!allowed)return;
  const controller=new AbortController();
  const timer=setTimeout(async()=>{
   if(!isCatalogEmoji(item)){setState('custom');return;}
   const saved=assets.get('emoji/'+item.fileName);if(saved){setAnimation(saved);return;}
   setState('Loading preview…');
   try{const files=await loadEmojiPreview(item,controller.signal);if(!controller.signal.aborted){setAnimation(files.get('emoji/'+item.fileName));setState('');}}
   catch{if(!controller.signal.aborted)setState('Preview unavailable · you can still insert');}
  },150);
  return()=>{clearTimeout(timer);controller.abort();};
 },[item.token,item.fileName,allowed,assets]);
 const url=useBlobUrl(animation);
 return <div className="inline-emoji-preview-art" aria-label={`Preview ${item.label}`}>
  <EmojiThumbnail item={item} hidden={allowed&&(!!url&&loadedUrl===url||state==='custom')}/>
  {allowed&&url&&<img key={url} className="inline-emoji-preview-animation" style={{opacity:loadedUrl===url?1:0}} src={url} alt="" onLoad={()=>setLoadedUrl(url)} onError={()=>{setAnimation(undefined);setState('Preview unavailable · you can still insert');}}/>}
  {allowed&&state==='custom'&&<AnimatedEmoji item={item} blob={assets.get('emoji/'+item.fileName)} data={item.data} preview/>}
  {state&&state!=='custom'&&<span className="inline-emoji-preview-status" role="status">{state}</span>}
 </div>;
}
