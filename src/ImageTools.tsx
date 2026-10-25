import {useEffect,useMemo,useRef,useState,type ReactNode,type CSSProperties} from 'react';
import type {RecordData} from './data';
import {imageType} from './media.mjs';
import {Icon} from './icons';
import './images.css';
export function useImageUrl(item:RecordData,blob?:Blob){
 const url=useMemo(()=>blob?URL.createObjectURL(new Blob([blob],{type:imageType(item.fileName,item.mimeType)||blob.type})):null,[blob,item.fileName,item.mimeType]);
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);},[url]);return url;
}
export function ImageDialog({title,onClose,children,className=''}:{title:string;onClose:()=>void;children:ReactNode;className?:string}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null,dialog=ref.current!;if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');dialog.querySelector<HTMLButtonElement>('button')?.focus();return()=>{if(dialog.open&&dialog.close)dialog.close();if(previous?.isConnected)previous.focus();};},[]);
 return <dialog ref={ref} className={`image-dialog ${className}`} aria-label={title} onKeyDown={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()} onCancel={e=>{e.preventDefault();e.stopPropagation();onClose();}} onClick={e=>{e.stopPropagation();if(e.target===e.currentTarget)onClose();}}><header className="image-dialog-header"><h2>{title}</h2><button className="icon-button" aria-label="Close image dialog" onClick={onClose}><Icon name="close"/></button></header>{children}</dialog>;
}
export function ImageViewer({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}){
 return <ImageDialog title={title} onClose={onClose} className="image-viewer"><div className="image-viewer-body">{children}</div><div className="image-viewer-footer">Full image · press Escape to close</div></ImageDialog>;
}
export type Mask={id:string;x:number;y:number;w:number;h:number;label:string};
export function MaskedImage({url,masks,activeId,revealed=false,mode='all',alt='Image occlusion',onLoad}:{url:string;masks:Mask[];activeId?:string;revealed?:boolean;mode?:string;alt?:string;onLoad?:()=>void}){
 const [ratio,setRatio]=useState(1.35);
 return <div className="occlusion-image" style={{'--image-ratio':ratio} as CSSProperties}><img src={url} alt={alt} draggable={false} onLoad={event=>{const image=event.currentTarget;if(image.naturalWidth&&image.naturalHeight)setRatio(image.naturalWidth/image.naturalHeight);onLoad?.();}}/>{masks.map((mask,i)=>{const active=mask.id===activeId,hidden=active?!revealed:mode==='all';return hidden||active?<span key={mask.id} className={`occlusion-mask ${active?'is-target':''} ${active&&revealed?'is-revealed':''}`} aria-label={active?(revealed?'Revealed region':'Hidden region'):'Other hidden region'} style={{left:mask.x*100+'%',top:mask.y*100+'%',width:mask.w*100+'%',height:mask.h*100+'%'}}>{hidden&&<b>{i+1}</b>}</span>:null;})}</div>;
}
export function OcclusionStudyImage({definition,blob,revealed}:{definition:any;blob?:Blob;revealed:boolean}){
 const url=useImageUrl(definition.media,blob),[full,setFull]=useState(false);
 if(!url)return <p className="image-fallback">Image unavailable. Restore its full backup to study this card.</p>;
 const picture=<MaskedImage url={url} masks={definition.masks} activeId={definition.maskId} mode={definition.mode} revealed={revealed}/>;
 return <div className="occlusion-study"><p className="occlusion-instruction">{revealed?'Answer revealed in the outlined region.':'Recall what is hidden in the highlighted region.'}</p>{picture}<button className="study-text-button" onClick={()=>setFull(true)}><Icon name="fullscreen" size={15}/>View full screen</button>{full&&<ImageViewer title="Image occlusion — full view" onClose={()=>setFull(false)}>{picture}</ImageViewer>}</div>;
}
