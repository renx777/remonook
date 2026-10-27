import {useEffect,useState} from 'react';
const key='remo-emoji-collection',event='remo-emoji-collection-change';
let fallback='all';
const read=()=>{try{const value=window.localStorage.getItem(key);return ['all','noto','fluent'].includes(value||'')?value!:fallback;}catch{return fallback;}};
export function useEmojiCollection(){
 const [collection,setCollection]=useState(read);
 useEffect(()=>{const update=()=>setCollection(read());window.addEventListener(event,update);window.addEventListener('storage',update);return()=>{window.removeEventListener(event,update);window.removeEventListener('storage',update);};},[]);
 const choose=(value:string)=>{fallback=value;setCollection(value);try{window.localStorage.setItem(key,value);}catch{/* Picker remains usable when preferences cannot persist. */}window.dispatchEvent(new window.Event(event));};
 return [collection,choose] as const;
}
