import {useEffect,useRef,useState} from 'react';
import {cachedBook} from './book-cache';
import type {LibraryBook} from './useBookLibrary';
const tones=['moss','clay','ink','ochre','plum','slate'];
export function BookCover({uid,book}:{uid:string;book:LibraryBook}){
 const root=useRef<HTMLSpanElement>(null),[url,setUrl]=useState('');
 useEffect(()=>{let active=true,objectUrl='';const controller=new AbortController();const open=async()=>{
  try{let image=await cachedBook(uid,'cover-v1:'+book.hash);if(!active)return;
   if(!image){const original=await cachedBook(uid,book.id+':'+book.hash);if(!active||!original)return;const {bookCover}=await import('./book-cover');image=await bookCover(original,book.format,controller.signal);if(image&&active)await cachedBook(uid,'cover-v1:'+book.hash,image);}
   if(image&&active){objectUrl=URL.createObjectURL(image);setUrl(objectUrl);}
  }catch{/* A typographic cover remains available if the original has no preview. */}
 };const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();void open();}},{rootMargin:'160px'});if(root.current)observer.observe(root.current);return()=>{active=false;controller.abort();observer.disconnect();if(objectUrl)URL.revokeObjectURL(objectUrl);};},[uid,book.id,book.hash,book.format]);
 const title=(book.title||book.name).replace(/[_]+/g,' ');
 return <span ref={root} className={'book-cover tone-'+tones[parseInt(book.hash.slice(0,4),16)%tones.length]} aria-hidden="true">{url?<img src={url} alt="" loading="lazy"/>:<><span className="book-cover-format">{book.format.toUpperCase()}</span><span className="book-cover-title">{title}</span><span className="book-cover-rule"/><span className="book-cover-imprint">REMONOOK LIBRARY</span></>}</span>;
}
