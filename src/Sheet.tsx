import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
/** A bottom sheet on phones and a popover under its button on wider screens. Escape or the scrim closes it. */
export function Sheet({anchor,label,onClose,children}:{anchor:HTMLElement|null;label:string;onClose:()=>void;children:ReactNode}){
 const box=useRef<HTMLDivElement>(null),[pos,setPos]=useState<React.CSSProperties>({});
 useLayoutEffect(()=>{
  if(typeof window==='undefined'||window.innerWidth<=760||!anchor){setPos({});return;}
  const r=anchor.getBoundingClientRect(),w=340;
  setPos({top:Math.min(r.bottom+6,window.innerHeight-120),left:Math.max(12,Math.min(r.right-w,window.innerWidth-w-12))});
 },[anchor]);
 useEffect(()=>{
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}};
  window.addEventListener('keydown',key,true);
  box.current?.querySelector<HTMLElement>('button,input,select')?.focus();
  return ()=>{window.removeEventListener('keydown',key,true);if(anchor?.isConnected)anchor.focus();};
 },[]);
 return createPortal(<><div className="rn-sheet-scrim" onClick={onClose}/><div ref={box} className="rn-sheet" role="dialog" aria-label={label} style={pos}>{children}</div></>,document.querySelector('.app')||document.body);
}
