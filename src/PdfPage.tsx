import {memo,useEffect,useRef,useState} from 'react';
import type {TextLayer,PDFDocumentProxy} from 'pdfjs-dist';
import './pdf-text-layer.css';
export const PdfPage=memo(function PdfPage({pdf,unit,zoom,containerRef,onReady,onError,overlay}:{pdf:PDFDocumentProxy;unit:number;zoom:number;containerRef:(el:HTMLDivElement|null)=>void;onReady:()=>void;onError:(message:string)=>void;overlay:React.ReactNode}){
 const root=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),layer=useRef<HTMLDivElement>(null),[width,setWidth]=useState(0);
 useEffect(()=>{const host=root.current;if(!host)return;const measure=()=>setWidth(Math.round(host.clientWidth));measure();const observer=new ResizeObserver(measure);observer.observe(host);return()=>observer.disconnect();},[]);
 useEffect(()=>{if(!width)return;let active=true,task:any,textLayer:TextLayer|undefined,page:any;
  const run=async()=>{const {TextLayer}=await import('pdfjs-dist');if(!active)return;page=await pdf.getPage(unit+1);if(!active)return;const base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.max(.2,(width/base.width)*zoom)}),ratio=Math.min(window.devicePixelRatio||1,2,Math.sqrt(4000000/(viewport.width*viewport.height)),8192/viewport.width,8192/viewport.height);
   const el=canvas.current!,text=layer.current!;el.width=Math.ceil(viewport.width*ratio);el.height=Math.ceil(viewport.height*ratio);el.style.width=viewport.width+'px';el.style.height=viewport.height+'px';text.replaceChildren();text.style.width=viewport.width+'px';text.style.height=viewport.height+'px';text.style.setProperty('--scale-factor',String(viewport.scale));text.style.setProperty('--total-scale-factor',String(viewport.scale*viewport.userUnit));
   task=page.render({canvas:el,viewport,transform:ratio===1?undefined:[ratio,0,0,ratio,0,0],background:'#ffffff'});await task.promise;if(!active)return;
   const content=await page.getTextContent();if(!active)return;textLayer=new TextLayer({textContentSource:content,container:text,viewport});const scale=viewport.scale*viewport.userUnit,w=viewport.rawDims.pageWidth*scale,h=viewport.rawDims.pageHeight*scale;text.style.width=w+'px';text.style.height=h+'px';text.style.transform=viewport.rotation===90?`matrix(0,1,-1,0,${h},0)`:viewport.rotation===180?`matrix(-1,0,0,-1,${w},${h})`:viewport.rotation===270?`matrix(0,-1,1,0,0,${w})`:'none';await textLayer.render();if(active)onReady();
  };void run().catch(e=>{if(active&&e.name!=='RenderingCancelledException')onError('This PDF page could not be rendered.');});
  return()=>{active=false;task?.cancel();textLayer?.cancel();page?.cleanup();};
 },[pdf,unit,width,zoom]);
 return <div ref={root} className="reader-pdf-width"><div className="reader-pdf-page" ref={containerRef}><canvas ref={canvas}/><div className="textLayer reader-selectable" ref={layer}/>{overlay}</div></div>;
});
