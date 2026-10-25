import {MusicGallery} from './Music';
import {Gallery,GalleryContext} from './Gallery';
import {useContext} from 'react';
import { ImageViewer, useImageUrl } from "./ImageTools";
import { useEffect, useMemo, useState, useRef } from "react";
import { mediaLinks } from "./media.mjs";
import { Icon } from "./icons";
import type { RecordData } from "./data";

function LocalImage({ item, blob, onRemove, onResize, onOcclude }: { item: RecordData; blob: Blob | undefined; onRemove?: (id: string) => void;onResize?:(id:string,width:number)=>void;onOcclude?:(id:string)=>void }) {
  const [failed,setFailed]=useState(false),[full,setFull]=useState(false),[width,setWidth]=useState(Number(item.displayWidth)||100),drag=useRef<{pointer:number;x:number;width:number;container:number}|null>(null),url=useImageUrl(item,blob);
  useEffect(()=>{if(!drag.current)setWidth(Number(item.displayWidth)||100);},[item.displayWidth]);
  useEffect(()=>{setFailed(false);},[url]);
  if((item.mimeType||'').startsWith('audio/'))return <figure className="note-image"><audio src={url||undefined} controls preload="metadata"/><figcaption>{item.credit||item.fileName}{onRemove&&<button aria-label="Remove audio" onClick={()=>onRemove(item.id)}>×</button>}</figcaption></figure>;
  if((item.mimeType||'').startsWith('video/'))return <figure className="note-image"><video src={url||undefined} controls playsInline preload="metadata" style={{maxWidth:'100%',maxHeight:440}}/><figcaption><span>{item.credit||item.fileName}</span>{onRemove&&<button aria-label={`Remove video ${item.credit||item.fileName}`} onClick={()=>onRemove(item.id)}><Icon name="close" size={12}/></button>}</figcaption></figure>;
  const bounded=(value:number)=>Math.max(15,Math.min(100,Math.round(value)));
  return <figure className="note-image">
    {url&&!failed?<><div className={`image-frame ${drag.current?'is-resizing':''}`} style={{width:width+'%'}}><img src={url} alt={item.credit||'Note image'} loading="lazy" draggable={false} role="button" tabIndex={0} aria-label={`View full image ${item.credit||item.fileName}`} onClick={()=>setFull(true)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();setFull(true);}}} onError={()=>setFailed(true)}/>{onResize&&<button className="image-resize-handle" aria-label={`Resize image ${item.credit||item.fileName}`} title="Drag to resize · arrow keys adjust" onClick={e=>e.stopPropagation()} onPointerDown={e=>{e.stopPropagation();e.preventDefault();if(e.button>0||e.isPrimary===false)return;const container=e.currentTarget.closest('figure')!.getBoundingClientRect().width;if(!container)return;drag.current={pointer:e.pointerId,x:e.clientX,width,container};e.currentTarget.setPointerCapture?.(e.pointerId);}} onPointerMove={e=>{const start=drag.current;if(start?.pointer===e.pointerId)setWidth(bounded(start.width+(e.clientX-start.x)/start.container*100));}} onPointerUp={e=>{const start=drag.current;if(start?.pointer!==e.pointerId)return;drag.current=null;const next=bounded(start.width+(e.clientX-start.x)/start.container*100);setWidth(next);onResize(item.id,next);if(e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{drag.current=null;setWidth(Number(item.displayWidth)||100);}} onLostPointerCapture={()=>{if(drag.current){drag.current=null;setWidth(Number(item.displayWidth)||100);}}} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();const next=e.key==='Home'?15:e.key==='End'?100:bounded(width+(e.key==='ArrowRight'?5:-5));setWidth(next);onResize(item.id,next);}}}>↘</button>}</div><div className="image-tools"><button onClick={()=>setFull(true)}><Icon name="fullscreen" size={13}/>View full screen</button>{onOcclude&&<button onClick={()=>onOcclude(item.id)}><Icon name="study" size={13}/>Image occlusion</button>}{onResize&&<><button onClick={()=>{setWidth(100);onResize(item.id,100);}}>Reset size</button><output aria-label="Image width">{width}%</output></>}</div></>:<div className="image-fallback"><Icon name="image"/><span>{url?'This image format cannot be previewed in your browser.':'This attachment is unavailable.'}</span></div>}
    <figcaption><span>{item.credit||item.fileName}</span>{url&&<a href={url} download={item.fileName}>Download original</a>}{onRemove&&<button className="remove-note-image" aria-label={`Remove image ${item.credit||item.fileName}`} onClick={()=>onRemove(item.id)}><Icon name="close" size={12}/></button>}</figcaption>
    {full&&url&&<ImageViewer title={item.credit||'Full image'} onClose={()=>setFull(false)}><img src={url} alt={item.credit||'Full note image'}/></ImageViewer>}
  </figure>;
}

function Embed({ item,onEdit }: { item: ReturnType<typeof mediaLinks>[number];onEdit?:()=>void }) {
  const [loaded, setLoaded] = useState(true), [failed, setFailed] = useState(false),[full,setFull]=useState(false),[showText,setShowText]=useState(false);
  if (!item) return null;
  if (item.kind === "link") return <a className="note-link" href={item.href} target="_blank" rel="noopener noreferrer"><Icon name="link" size={14} /><span>{item.href}</span><Icon name="forward" size={12} /></a>;
  return <div className={`media-embed media-${item.kind}`}>
    {loaded ? item.kind === "image" ? <>{!failed && <img src={item.href} alt="Linked note image" role="button" tabIndex={0} aria-label={onEdit?"Edit embedded image bullet":"Show image link"} onClick={()=>onEdit?onEdit():setShowText(v=>!v)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();if(onEdit)onEdit();else setShowText(v=>!v);}}} loading="lazy" onError={() => setFailed(true)} />}{failed && <p>Preview unavailable. Open the original link below.</p>}</> : item.kind === "audio" ? <audio src={item.href} controls preload="metadata"/> : item.kind === "video" ? <video src={item.href} controls preload="metadata" playsInline onError={()=>setFailed(true)}/> : <iframe src={item.embed!} title={item.title} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen /> : <button className="embed-placeholder" onClick={() => setLoaded(true)}><span className="embed-play"><Icon name={item.kind === "image" ? "image" : "play"} size={23} /></span><span><strong>{item.title}</strong><small>Load {item.kind === "image" ? "image" : "player"} from {new URL(item.href).hostname}</small></span></button>}
    {full&&<ImageViewer title="Linked image" onClose={()=>setFull(false)}><img src={item.href} alt="Full linked image"/></ImageViewer>}
    {item.kind==='image'&&showText&&<div className="image-embed-caption"><code>{`![](${item.href})`}</code><button onClick={()=>setFull(true)}>Full screen</button></div>}
    {(item.kind!=="image" || failed)&&<a className="embed-source" href={item.href} target="_blank" rel="noopener noreferrer">Open on {new URL(item.href).hostname}<Icon name="link" size={12} /></a>}
    {loaded && item.kind === "instagram" && <small className="embed-note">Public posts only. If the player is blocked, open the original.</small>}
  </div>;
}

export function MediaContent({ nodeId, text, media, assets, onRemove, onResize, onOcclude, onEdit }: { nodeId: string; text: string; media: RecordData[]; assets: Map<string, Blob>; onRemove?: (id: string) => void;onResize?:(id:string,width:number)=>void;onOcclude?:(id:string)=>void;onEdit?:()=>void }) {
  const gallery=useContext(GalleryContext);
  if(gallery?.doc.web.musicNodes?.[nodeId])return <MusicGallery doc={gallery.doc} id={nodeId} onAdd={gallery.onAdd?()=>gallery.onAdd?.(nodeId):undefined}/>;
  if(gallery?.doc.web.galleryNodes?.[nodeId])return <Gallery id={nodeId} assets={assets}/>;
  return <div className="note-media" onPointerDown={event => event.stopPropagation()}>
    {media.filter(item => item.bulletId === nodeId).map(item => <LocalImage key={item.id} item={item} blob={assets.get("media/" + item.fileName)} onRemove={onRemove} onResize={onResize} onOcclude={onOcclude} />)}
    {mediaLinks(text).map(item => <Embed key={item!.href} item={item} onEdit={onEdit} />)}
  </div>;
}
