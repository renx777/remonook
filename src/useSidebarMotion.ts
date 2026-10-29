import {useLayoutEffect,useRef} from 'react';
import {animate} from 'motion/mini';

/** Resize the outline once; animate its position and the sidebar on the compositor. */
export function useSidebarMotion(open:boolean){
 const mainRef=useRef<HTMLElement>(null),before=useRef<number|null>(null),restoreFocus=useRef(false);
 const capture=()=>{before.current=mainRef.current?.getBoundingClientRect().left??null;restoreFocus.current=!!document.activeElement?.closest('.sidebar');};
 useLayoutEffect(()=>{
  const main=mainRef.current,previous=before.current;before.current=null;
  if(!main||previous===null)return;
  if(!open&&restoreFocus.current)main.querySelector<HTMLElement>('.topbar-sidebar-toggle')?.focus({preventScroll:true});
  restoreFocus.current=false;
  const preference=window.matchMedia?.('(prefers-reduced-motion: reduce)'),delta=previous-main.getBoundingClientRect().left;
  if(Math.abs(delta)<1||preference?.matches||typeof main.animate!=='function')return;
  const original=main.style.transform,controls=animate(main,{transform:[`translateX(${delta}px)`,'translateX(0px)']},{duration:.18,ease:[.22,1,.36,1]});
  let disposed=false;const reset=()=>{main.style.transform=original;};
  void controls.then(()=>{if(!disposed)reset();});
  const cancel=()=>{disposed=true;controls.cancel();reset();};
  const changed=()=>{if(preference?.matches)cancel();};preference?.addEventListener?.('change',changed);
  return()=>{preference?.removeEventListener?.('change',changed);cancel();};
 },[open]);
 return {mainRef,capture};
}
