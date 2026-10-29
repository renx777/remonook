import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useVirtualizer} from '@tanstack/react-virtual';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import {PdfPage} from './PdfPage';
type Annotation={id:string;unit:number;color:string;rects:{x:number;y:number;w:number;h:number}[]};
export type PdfFit='auto'|'width'|'page';
export function PdfDocument({pdf,scroll,request,zoom,fit,highlights,focused,onUnit,onHost,onReady,onLoading,onError}:{pdf:PDFDocumentProxy;scroll:React.RefObject<HTMLDivElement|null>;request:{unit:number;sequence:number};zoom:number;fit:PdfFit;highlights:Annotation[];focused?:string;onUnit:(unit:number)=>void;onHost:(unit:number,host:HTMLDivElement|null)=>void;onReady:(unit:number)=>void;onLoading:(unit:number)=>void;onError:(message:string)=>void}){
 const [size,setSize]=useState({width:0,height:0}),[pageSize,setPageSize]=useState({width:816,height:1056});const initial=useRef(request.unit);
 useEffect(()=>{const element=scroll.current;if(!element)return;const measure=()=>setSize({width:Math.max(100,element.clientWidth-16),height:Math.max(100,element.clientHeight-16)});measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();},[scroll]);
 useEffect(()=>{let active=true;void pdf.getPage(1).then(page=>{if(active){const viewport=page.getViewport({scale:96/72});setPageSize({width:viewport.width,height:viewport.height});}}).catch(()=>{});return()=>{active=false;};},[pdf]);
 const ratio=pageSize.height/pageSize.width,base=fit==='width'?size.width:fit==='page'?Math.min(size.width,size.height/ratio):Math.min(size.width,pageSize.width),width=Math.max(100,Math.round(base*zoom)),estimate=width*ratio+12;
 const virtual=useVirtualizer<HTMLDivElement,HTMLDivElement>({count:pdf.numPages,getScrollElement:()=>scroll.current,estimateSize:()=>estimate,overscan:1,enabled:size.width>0,initialOffset:()=>initial.current*estimate});
 const visible=virtual.range?.startIndex??request.unit;const lastVisible=useRef(request.unit),previousRequest=useRef(-1);
 useEffect(()=>{lastVisible.current=visible;onUnit(visible);},[visible,onUnit]);
 useLayoutEffect(()=>{if(!size.width)return;const destination=previousRequest.current!==request.sequence?request.unit:lastVisible.current;previousRequest.current=request.sequence;virtual.measure();virtual.scrollToIndex(destination,{align:'start'});},[request.sequence,width,size.height]);
 return <div className="reader-pdf-document" style={{height:virtual.getTotalSize(),width,minWidth:width}} aria-label="PDF pages">{virtual.getVirtualItems().map(item=><div key={item.key} ref={virtual.measureElement} data-index={item.index} className="reader-pdf-slot" style={{position:'absolute',top:0,left:0,width:'100%',transform:`translateY(${item.start}px)`}}>
  <PdfPage pdf={pdf} unit={item.index} zoom={1} containerRef={host=>onHost(item.index,host)} onLoading={()=>onLoading(item.index)} onReady={()=>onReady(item.index)} onError={onError} overlay={<div className="reader-pdf-highlights" aria-hidden="true">{highlights.filter(h=>h.unit===item.index).flatMap(h=>h.rects.map((r,i)=><span key={h.id+':'+i} data-color={h.color} className={h.id===focused?'is-target':''} style={{left:r.x*100+'%',top:r.y*100+'%',width:r.w*100+'%',height:r.h*100+'%'}}/>))}</div>}/>
 </div>)}</div>;
}
