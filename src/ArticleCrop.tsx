import * as Dialog from '@radix-ui/react-dialog';
import {useRef,useState} from 'react';
type Rect={x:number;y:number;w:number;h:number};
export function ArticleCrop({article,onCancel,onCapture}:{article:HTMLElement;onCancel:()=>void;onCapture:(r:Rect)=>void}){
 const viewport=article.parentElement!,bounds=viewport.getBoundingClientRect(),articleBounds=article.getBoundingClientRect();
 const width=Math.min(articleBounds.width,bounds.width),height=Math.min(bounds.height,1600);
 const [rect,setRect]=useState<Rect>({x:Math.min(16,width/4),y:16,w:Math.max(20,width-32),h:Math.max(20,height-48)});
 const drag=useRef<{x:number;y:number;r:Rect;corner:string}|null>(null);
 const start=(e:React.PointerEvent,corner:string)=>{e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,r:rect,corner};};
 const move=(e:React.PointerEvent)=>{if(!drag.current)return;const d=drag.current,dx=e.clientX-d.x,dy=e.clientY-d.y;let left=d.r.x,top=d.r.y,right=left+d.r.w,bottom=top+d.r.h;if(d.corner==='move'){left=Math.max(0,Math.min(width-d.r.w,left+dx));top=Math.max(0,Math.min(height-d.r.h,top+dy));right=left+d.r.w;bottom=top+d.r.h;}else{if(d.corner.includes('w'))left=Math.max(0,Math.min(right-12,left+dx));else right=Math.min(width,Math.max(left+12,right+dx));if(d.corner.includes('n'))top=Math.max(0,Math.min(bottom-12,top+dy));else bottom=Math.min(height,Math.max(top+12,bottom+dy));}setRect({x:left,y:top,w:right-left,h:bottom-top});};
 const capture=()=>onCapture({...rect,x:rect.x+Math.max(0,bounds.left-articleBounds.left),y:rect.y+viewport.scrollTop});
 return <Dialog.Root open onOpenChange={open=>{if(!open)onCancel();}}><Dialog.Portal container={article.closest('.app')||document.body}><Dialog.Content className="article-crop" aria-describedby={undefined}><Dialog.Title className="sr-only">Select screenshot region</Dialog.Title>
  <div className="article-crop-actions"><p>Adjust the region, then capture.</p><button autoFocus onClick={capture}>Preview selection</button><button onClick={onCancel}>Cancel</button></div>
  <div className="article-crop-viewport" style={{left:Math.max(bounds.left,articleBounds.left),top:bounds.top,width,height}}>
   <div className="article-crop-box" style={{left:rect.x,top:rect.y,width:rect.w,height:rect.h}} onPointerDown={e=>start(e,'move')} onPointerMove={move} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null}>
    {['nw','ne','sw','se'].map(c=><button key={c} className={'article-crop-handle '+c} aria-label={'Resize '+c+' corner'} onPointerDown={e=>start(e,c)} onPointerMove={move} onPointerUp={()=>drag.current=null} onKeyDown={e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();setRect(r=>({...r,w:Math.max(12,Math.min(width-r.x,r.w+(e.key==='ArrowRight'?8:e.key==='ArrowLeft'?-8:0))),h:Math.max(12,Math.min(height-r.y,r.h+(e.key==='ArrowDown'?8:e.key==='ArrowUp'?-8:0)))}));}}/>)}
   </div>
  </div>
 </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
