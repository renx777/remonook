import {createContext,useContext,useEffect,useState,useRef} from 'react';
import type {Workspace} from './data';
import {galleryItems} from './gallery.mjs';
import {ImageDialog,useImageUrl} from './ImageTools';
import {Icon} from './icons';
export const GalleryContext=createContext<{doc:Workspace;onAdd?:(id:string)=>void}|null>(null);
function Picture({item,assets,full=false}:{item:any;assets:Map<string,Blob>;full?:boolean}){
 const url=useImageUrl(item.local||{},item.local?assets.get('media/'+item.local.fileName):undefined),src=url||item.href,[failed,setFailed]=useState(false);
 if(failed||!src)return <span className="gallery-missing">Preview unavailable</span>;
 if(item.kind==='image')return <img src={src} alt={item.label} loading="lazy" onError={()=>setFailed(true)}/>;
 if(item.kind==='video')return <video src={src} controls={full} muted={!full} preload="metadata" playsInline onError={()=>setFailed(true)}/>;
 return full?<iframe src={item.embed} title={item.label} sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" allow="fullscreen; encrypted-media; picture-in-picture" allowFullScreen/>:<span className="gallery-video-poster"><Icon name="play" size={26}/><small>{item.label}</small></span>;
}
export function Gallery({id,assets}:{id:string;assets:Map<string,Blob>}){
 const context=useContext(GalleryContext)!,items=galleryItems(context.doc,id),[active,setActive]=useState<number|null>(null),touch=useRef<number|null>(null);
 const navigate=(delta:number)=>setActive(i=>i===null?null:(i+delta+items.length)%items.length);
 useEffect(()=>{if(active===null)return;const key=(e:KeyboardEvent)=>{if(['ArrowLeft','ArrowRight'].includes(e.key)&&!(e.target as HTMLElement).closest('video,input')){e.preventDefault();e.stopPropagation();navigate(e.key==='ArrowRight'?1:-1);}};document.addEventListener('keydown',key,true);return()=>document.removeEventListener('keydown',key,true);},[active,items.length]);
 return <div className="bullet-gallery" onClick={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()}><div className="gallery-topline"><span><Icon name="image" size={14}/>Gallery · {items.length}</span>{context.onAdd&&<button onClick={()=>context.onAdd?.(id)}><Icon name="plus" size={13}/>Add media</button>}</div>{items.length?<div className="gallery-grid">{items.map((item:any,i:number)=><button key={item.key} aria-label={`Open gallery item ${i+1}: ${item.label}`} onClick={()=>setActive(i)}><Picture item={item} assets={assets}/>{item.kind!=='image'&&<span className="gallery-play"><Icon name="play" size={18}/></span>}</button>)}</div>:<p className="gallery-empty">Add images, GIFs or videos here, or embed them in child bullets.</p>}
 {active!==null&&items[active]&&<ImageDialog title={`Gallery · ${active+1} / ${items.length}`} className="gallery-viewer" onClose={()=>setActive(null)}><div className="gallery-stage" onTouchStart={e=>{touch.current=e.touches[0]?.clientX??null;}} onTouchEnd={e=>{if(touch.current!==null){const dx=e.changedTouches[0].clientX-touch.current;if(Math.abs(dx)>60)navigate(dx<0?1:-1);}touch.current=null;}}><Picture key={items[active].key} item={items[active]} assets={assets} full/></div><div className="gallery-navigation"><button aria-label="Previous gallery item" disabled={items.length<2} onClick={()=>navigate(-1)}><Icon name="back"/></button><span>{items[active].label}</span><button aria-label="Next gallery item" disabled={items.length<2} onClick={()=>navigate(1)}><Icon name="forward"/></button></div></ImageDialog>}</div>;
}
