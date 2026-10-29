import {memo,useEffect,useRef,useState} from 'react';
import type {TextLayer,PDFDocumentProxy,PDFPageProxy,RenderTask} from 'pdfjs-dist';
import './pdf-text-layer.css';
export const PdfPage=memo(function PdfPage({pdf,unit,zoom,containerRef,onReady,onLoading,onError,overlay}:{pdf:PDFDocumentProxy;unit:number;zoom:number;containerRef:(el:HTMLDivElement|null)=>void;onReady:()=>void;onLoading:()=>void;onError:(message:string)=>void;overlay:React.ReactNode}){
 const root=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),layer=useRef<HTMLDivElement>(null),pending=useRef<Promise<void>>(Promise.resolve()),[width,setWidth]=useState(0),[hasText,setHasText]=useState(true);
 useEffect(()=>{const element=root.current;if(!element)return;const measure=()=>setWidth(Math.round(element.clientWidth));measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();},[]);
 useEffect(()=>{
  if(!width)return;onLoading();let active=true,task:RenderTask|undefined,textLayer:TextLayer|undefined,page:PDFPageProxy|undefined;
  const run=async()=>{
   if(!active)return;const {TextLayer}=await import('pdfjs-dist');if(!active)return;
   page=await pdf.getPage(unit+1);const el=canvas.current,text=layer.current;
   // A virtual row's DOM refs can detach before React runs its passive cleanup.
   if(!active||!el||!text)return;
   const base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.max(.2,(width/base.width)*zoom)}),ratio=Math.min(window.devicePixelRatio||1,2,Math.sqrt(4000000/(viewport.width*viewport.height)),8192/viewport.width,8192/viewport.height);
   el.width=Math.ceil(viewport.width*ratio);el.height=Math.ceil(viewport.height*ratio);el.style.width=viewport.width+'px';el.style.height=viewport.height+'px';text.replaceChildren();text.style.width=viewport.width+'px';text.style.height=viewport.height+'px';text.style.setProperty('--scale-factor',String(viewport.scale));text.style.setProperty('--total-scale-factor',String(viewport.scale*viewport.userUnit));
   task=page.render({canvas:el,viewport,transform:ratio===1?undefined:[ratio,0,0,ratio,0,0],background:'#ffffff'});await task.promise;
   if(!active||canvas.current!==el||layer.current!==text)return;const content=await page.getTextContent();if(!active||layer.current!==text)return;
   textLayer=new TextLayer({textContentSource:content,container:text,viewport});const scale=viewport.scale*viewport.userUnit,raw=viewport.rawDims as {pageWidth:number;pageHeight:number},w=raw.pageWidth*scale,h=raw.pageHeight*scale;text.style.width=w+'px';text.style.height=h+'px';text.style.transform=viewport.rotation===90?`matrix(0,1,-1,0,${h},0)`:viewport.rotation===180?`matrix(-1,0,0,-1,${w},${h})`:viewport.rotation===270?`matrix(0,-1,1,0,0,${w})`:'none';await textLayer.render();
   if(active&&layer.current===text){setHasText(content.items.some(item=>'str' in item&&!!item.str.trim()));onReady();}
  };
  // Cancellation is asynchronous. Wait before reusing this canvas at a new size.
  const work=pending.current.catch(()=>{}).then(run).catch(error=>{if(active&&canvas.current&&error.name!=='RenderingCancelledException')onError('This PDF page could not be rendered.');});pending.current=work;
  return()=>{active=false;task?.cancel();textLayer?.cancel();void work.then(()=>page?.cleanup());};
 },[pdf,unit,width,zoom]);
 return <div ref={root} className="reader-pdf-width"><div className="reader-pdf-page" data-reader-unit={unit} ref={containerRef}><canvas ref={canvas}/><div className="textLayer reader-selectable" ref={layer}/>{overlay}{!hasText&&<span className="reader-page-label">No selectable text on this page</span>}</div></div>;
});
