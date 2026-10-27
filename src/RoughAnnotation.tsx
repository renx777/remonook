import {useLayoutEffect,useRef,type ReactNode,type CSSProperties} from 'react';
import {Mark} from '@tiptap/core';
import {annotate} from 'rough-notation';
import {parseRoughStyle,roughStyle,roughColor} from './rough-annotations.mjs';
import './rough-annotations.css';
type Config={type:'circle'|'box'|'underline'|'highlight';color:string};

// Keep generated SVG beside the content, outside ProseMirror's editable contentDOM.
// Layout redraws never animate; only the first visible draw does.
export function mountRoughAnnotation(host:HTMLElement,content:HTMLElement,config:Config,editing=false){
 let disposed=false,visible=typeof IntersectionObserver==='undefined',pending=false,first=true;
 const media=window.matchMedia('(prefers-reduced-motion: reduce)');
 const annotation=annotate(content,{type:config.type,color:roughColor(config.type,config.color),multiline:true,padding:config.type==='highlight'?1:3,strokeWidth:1.5,iterations:2,animationDuration:500,animate:!editing&&!media.matches&&!document.hidden});
 const draw=()=>{
  pending=false;if(disposed||!visible||!host.isConnected)return;
  annotation.animate=first&&!editing&&!media.matches&&!document.hidden;
  annotation.show();first=false;
  const svg=host.querySelector<SVGElement>(':scope > svg.rough-annotation');
  if(svg){svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.setAttribute('contenteditable','false');}
  host.classList.toggle('rough-ready',!!svg?.querySelector('path'));
 };
 const schedule=()=>{if(!pending&&!disposed){pending=true;queueMicrotask(draw);}};
 const changes=new MutationObserver(schedule);changes.observe(content,{childList:true,characterData:true,subtree:true});
 const size=typeof ResizeObserver==='undefined'?null:new ResizeObserver(schedule);size?.observe(host.parentElement||host);
 const visibility=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);if(visible)schedule();},{rootMargin:'40px'});visibility?.observe(host);
 window.addEventListener('resize',schedule);document.addEventListener('visibilitychange',schedule);media.addEventListener?.('change',schedule);
 document.fonts?.ready.then(schedule).catch(()=>{});schedule();
 return ()=>{disposed=true;changes.disconnect();size?.disconnect();visibility?.disconnect();window.removeEventListener('resize',schedule);document.removeEventListener('visibilitychange',schedule);media.removeEventListener?.('change',schedule);annotation.remove();};
}
function attributes(config:Config){return {'data-remo-rough':config.type,'data-remo-rough-color':config.color,class:'rough-mark',style:`--rough-color:${roughColor(config.type,config.color)}`};}
export const RemoRough=Mark.create({
 name:'remoRough',inclusive:false,
 addAttributes(){return {type:{default:'circle'},color:{default:'AUTO'}};},
 parseHTML(){return [{tag:'span[data-remo-rough]',getAttrs:element=>{const el=element as HTMLElement,config=parseRoughStyle(roughStyle(el.dataset.remoRough,el.dataset.remoRoughColor||'AUTO'));return config||false;}}];},
 renderHTML({HTMLAttributes}){const config=parseRoughStyle(roughStyle(HTMLAttributes.type,HTMLAttributes.color)) as Config|null;return ['span',attributes(config||{type:'circle',color:'AUTO'}),['span',{class:'rough-content'},0]];},
 addMarkView(){return ({mark})=>{
  const config=parseRoughStyle(roughStyle(mark.attrs.type,mark.attrs.color)) as Config;
  const dom=document.createElement('span'),contentDOM=document.createElement('span');for(const [key,value]of Object.entries(attributes(config)))dom.setAttribute(key,value);contentDOM.className='rough-content';dom.append(contentDOM);
  let stopped=false,dispose:(()=>void)|undefined;queueMicrotask(()=>{if(!stopped&&dom.isConnected)dispose=mountRoughAnnotation(dom,contentDOM,config,true);});
  return {dom,contentDOM,ignoreMutation:mutation=>mutation.type!=='selection'&&(mutation.target===dom||!contentDOM.contains(mutation.target)||mutation.type==='attributes'&&mutation.target===contentDOM),destroy(){stopped=true;dispose?.();}};
 };},
});
export function RoughAnnotation({type,color,children}:{type:Config['type'];color:string;children:ReactNode}){
 const host=useRef<HTMLSpanElement>(null),content=useRef<HTMLSpanElement>(null);
 useLayoutEffect(()=>{if(host.current&&content.current)return mountRoughAnnotation(host.current,content.current,{type,color});},[type,color]);
 return <span ref={host} className="rough-mark" data-remo-rough={type} data-remo-rough-color={color} style={{'--rough-color':roughColor(type,color)} as CSSProperties}><span ref={content} className="rough-content">{children}</span></span>;
}
