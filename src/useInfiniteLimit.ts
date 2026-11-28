import {useEffect,useRef} from 'react';
/**
 * Infinite scroll: observes a sentinel placed after the last shown item and calls `more` while it is
 * within `margin` of the viewport, so the next page is ready before the reader reaches the end.
 * Re-observes after every page, so a tall screen keeps filling until the sentinel is out of reach.
 * Without IntersectionObserver (tests, very old browsers) nothing loads by itself; the sentinel
 * stays a button that loads the next page when pressed.
 */
export function useInfiniteLimit(active:boolean,limit:number,more:()=>void,margin=1600){
 const sentinel=useRef<HTMLElement|null>(null),latest=useRef(more);latest.current=more;
 useEffect(()=>{
  const el=sentinel.current;if(!active||!el||typeof IntersectionObserver==='undefined')return;
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))latest.current();},{rootMargin:`${margin}px 0px`});
  observer.observe(el);return ()=>observer.disconnect();
 },[active,limit,margin]);
 return sentinel;
}
