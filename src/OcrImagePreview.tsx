import {useLayoutEffect,useRef,type PointerEvent} from 'react';
import {drawOcrImage,fullImage,type ImageCrop} from './local-ocr';

type Point = {x:number;y:number};
const clamp=(n:number)=>Math.max(0,Math.min(1,n));

export function OcrImagePreview({image,rotation,invert,crop,selecting,onCrop}:{
  image:HTMLImageElement;rotation:number;invert:boolean;crop:ImageCrop;
  selecting:boolean;onCrop:(crop:ImageCrop)=>void;
}){
  const canvas=useRef<HTMLCanvasElement>(null);
  const drag=useRef<{start:Point;id:number;original:ImageCrop}|null>(null);
  useLayoutEffect(()=>{
    if(canvas.current)drawOcrImage(canvas.current,image,rotation,fullImage,invert,640,400_000);
  },[image,rotation,invert]);
  const point=(event:PointerEvent<HTMLElement>)=>{
    const rect=event.currentTarget.getBoundingClientRect();
    return {x:clamp((event.clientX-rect.left)/rect.width),y:clamp((event.clientY-rect.top)/rect.height)};
  };
  const selection=(a:Point,b:Point):ImageCrop=>({
    left:Math.min(a.x,b.x),top:Math.min(a.y,b.y),right:Math.max(a.x,b.x),bottom:Math.max(a.y,b.y),
  });
  return <div className="ocr-preview-scroll">
    <div className={`ocr-preview ${selecting?'is-cropping':''}`}
      onPointerDown={event=>{
        if(!selecting||event.button!==0||!event.isPrimary)return;
        drag.current={start:point(event),id:event.pointerId,original:crop};
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event=>{
        const current=drag.current;
        if(!current||current.id!==event.pointerId)return;
        const next=selection(current.start,point(event));
        if(next.right-next.left>=.02&&next.bottom-next.top>=.02)onCrop(next);
      }}
      onPointerUp={event=>{
        const current=drag.current;
        if(!current||current.id!==event.pointerId)return;
        const next=selection(current.start,point(event));
        drag.current=null;
        if(next.right-next.left>=.02&&next.bottom-next.top>=.02)onCrop(next);
      }}
      onPointerCancel={()=>{
        if(drag.current)onCrop(drag.current.original);
        drag.current=null;
      }}
      onLostPointerCapture={()=>{drag.current=null;}}>
      <canvas ref={canvas} role="img" aria-label="Image preview for text extraction"/>
      <div className="ocr-crop-box" aria-hidden="true" style={{
        left:crop.left*100+'%',top:crop.top*100+'%',
        width:(crop.right-crop.left)*100+'%',height:(crop.bottom-crop.top)*100+'%',
        visibility:selecting||crop!==fullImage?'visible':'hidden',
      }}/>
    </div>
  </div>;
}
