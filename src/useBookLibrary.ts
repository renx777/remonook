import {useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import {authenticatedUid} from './CloudAccount';
import {CLOUD_API} from './cloud-config';
import {digest,download,type Workspace} from './data';
import {checkBook,registerBooks} from './book-storage.mjs';
import {cachedBook} from './book-cache';
export type LibraryBook={id:string;name:string;format:string;size:number;hash:string;createdAt:number;title?:string;deleted?:boolean;position?:number};
export type Usage={attachments:number;books:number;total:number;limit:number;uploadsEnabled:boolean};
export function useBookLibrary({user,doc,onChange}:{user:User|null;doc:Workspace;onChange:(update:(doc:Workspace)=>Workspace)=>void}){
 const [usage,setUsage]=useState<Usage|null>(null),[server,setServer]=useState<LibraryBook[]>([]),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[online,setOnline]=useState(navigator.onLine);
 const lock=useRef(false),alive=useRef(true),requests=useRef(new Set<AbortController>()),change=useRef(onChange);change.current=onChange;
 const local=Object.values(doc.web.readingBooks||{}) as LibraryBook[],books=local.filter(b=>!b.deleted);
 const request=async(path:string,init:RequestInit={})=>{
  if(!user||authenticatedUid()!==user.uid)throw Error('Sign in to access your book storage.');
  const controller=new AbortController();requests.current.add(controller);const timeout=setTimeout(()=>controller.abort(),10*60000);
  try{const token=await user.getIdToken();if(!alive.current||authenticatedUid()!==user.uid)throw Error('Your account changed.');const response=await fetch(CLOUD_API+path,{...init,headers:{Authorization:'Bearer '+token,...init.headers},cache:'no-store',signal:controller.signal});
   if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(body.error||'Book storage could not be reached.');}return response;
  }finally{requests.current.delete(controller);clearTimeout(timeout);}
 };
 const refresh=async()=>{
  if(!user)return;
  const [status,list]=await Promise.all([request('/storage').then(r=>r.json()),request('/books').then(r=>r.json())]);
  if(!alive.current)return;setUsage(status);setServer(list.books);change.current(current=>registerBooks(current,list.books));
 };
 useEffect(()=>{alive.current=true;const update=()=>{setOnline(navigator.onLine);if(navigator.onLine&&!lock.current)void refresh().catch(e=>{if(alive.current)setError(e.message);});};void refresh().catch(e=>{if(alive.current)setError(e.message);});window.addEventListener('online',update);window.addEventListener('offline',update);window.addEventListener('focus',update);return()=>{alive.current=false;for(const controller of requests.current)controller.abort();window.removeEventListener('online',update);window.removeEventListener('offline',update);window.removeEventListener('focus',update);};},[user?.uid]);
 const run=async(label:string,action:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(label);setError('');setNotice('');try{await action();}catch(e){if(alive.current)setError((e as Error).message);}finally{lock.current=false;if(alive.current){setBusy('');if(navigator.onLine)void refresh().catch(()=>{});}}};
 const upload=(file:File)=>run('Adding book…',async()=>{
  checkBook(file);const {inspectBook}=await import('./book-files');await inspectBook(file);
  const hash=await digest(await file.arrayBuffer());
  const response=await request('/books',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),name:file.name,size:file.size,hash})});
  let result=await response.json();if(result.state!=='ready')result=await(await request('/books/'+result.book.id,{method:'PUT',body:file})).json();
  if(!alive.current)return;
  // The cloud upload is durable before library metadata enters normal note sync.
  change.current(current=>registerBooks(current,[result.book]));
  try{await cachedBook(user!.uid,result.book.id+':'+hash,file);}catch{setNotice('Book uploaded. This browser could not cache an offline copy.');return;}
  setNotice('Book added and cached on this device.');
 });
 const getFile=(book:LibraryBook)=>run('Preparing book…',async()=>{
  if(!user)return;let blob=await cachedBook(user.uid,book.id+':'+book.hash);
  if(navigator.onLine){const list=await(await request('/books')).json();if(!list.books.some((b:LibraryBook)=>b.id===book.id&&b.hash===book.hash))throw Error('This book is no longer in cloud storage. Reimport the original file.');}
  if(!blob){if(!navigator.onLine)throw Error('Connect to download this book first.');blob=await(await request('/books/'+book.id)).blob();if(blob.size!==book.size||await digest(await blob.arrayBuffer())!==book.hash)throw Error('Book integrity check failed. Please try again.');try{await cachedBook(user.uid,book.id+':'+book.hash,blob);}catch{setNotice('Downloaded, but this browser could not retain an offline copy.');}}
  if(alive.current&&authenticatedUid()===user.uid)download(blob,book.name);
 });
 const remove=(book:LibraryBook)=>{if(!window.confirm('Delete “'+(book.title||book.name)+'” from book storage? This removes its cloud file. Download a copy first if you need it.'))return;void run('Deleting book…',async()=>{
  await request('/books/'+book.id,{method:'DELETE'});if(!alive.current)return;
  change.current(current=>({...current,web:{...current.web,readingBooks:{...current.web.readingBooks,[book.id]:{...current.web.readingBooks[book.id],deleted:true}}}}));
  try{await cachedBook(user!.uid,book.id+':'+book.hash,null);}catch{/* Remote deletion has succeeded; old cache is inaccessible through the deleted entry. */}setNotice('Book deleted. Its storage allocation has been released.');
 });};
 return {usage,server,books,busy,error,notice,online,upload,getFile,remove};
}
