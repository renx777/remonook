import {useLayoutEffect, type RefObject} from 'react';
import {autoUpdate, computePosition, flip, offset, shift, size} from '@floating-ui/react-dom';

/** Keep editor selection intact: pointer presses never move focus out of the editor. */
export function usePalettePosition(open:boolean, details:RefObject<HTMLDetailsElement|null>, panel:RefObject<HTMLDivElement|null>) {
  useLayoutEffect(() => {
    const root=details.current, box=panel.current, anchor=root?.querySelector('summary');
    if (!open || !root || !box || !anchor) return;
    document.querySelectorAll<HTMLDetailsElement>('.format-palette[open]').forEach(item=>{if(item!==root)item.open=false;});
    let alive=true, generation=0;
    const place=async()=>{
      const current=++generation;
      const result=await computePosition(anchor,box,{strategy:'fixed',placement:'bottom-start',middleware:[offset(10),flip({padding:8}),shift({padding:8}),size({padding:8,apply({availableHeight}){if(alive)Object.assign(box.style,{maxHeight:`${Math.max(0,availableHeight)}px`,overflowY:'auto'});}})]});
      if(alive&&current===generation)Object.assign(box.style,{position:result.strategy,inset:'auto',left:`${result.x}px`,top:`${result.y}px`});
    };
    const cleanup=autoUpdate(anchor,box,()=>{void place();},{elementResize:typeof ResizeObserver!=='undefined',layoutShift:typeof IntersectionObserver!=='undefined'});
    const dismiss=(event:PointerEvent)=>{if(event.target instanceof window.Node&&!root.contains(event.target))root.open=false;};
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){
        event.preventDefault();event.stopPropagation();root.open=false;
        if(root.contains(document.activeElement))anchor.focus({preventScroll:true});
      }
    };
    root.addEventListener('keydown',key);
    document.addEventListener('pointerdown',dismiss);
    return()=>{alive=false;cleanup();root.removeEventListener('keydown',key);document.removeEventListener('pointerdown',dismiss);};
  },[open,details,panel]);
}
