import {useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import {authenticatedUid} from './CloudAccount';
import {CLOUD_API} from './cloud-config';
import {digest,download,type Workspace} from './data';
import {STORAGE_LIMIT,checkBook,registerBooks} from './book-storage.mjs';
import {cachedBook} from './book-cache';
import './book-storage.css';
type Book={id:string;name:string;format:string;size:number;hash:string;createdAt:number;title?:string;deleted?:boolean;position?:number};
type Usage={attachments:number;books:number;total:number;limit:number;uploadsEnabled:boolean};
const mib=(bytes:number)=>(bytes/1024/1024).toFixed(1)+' MiB';
export function BookStorage({user,doc,disabled,onChange,onSignIn}:{user:User|null;doc:Workspace;disabled:boolean;onChange:(update:(doc:Workspace)=>Workspace)=>void;onSignIn:()=>Promise<void>}){
 const [usage,setUsage]=useState<Usage|null>(null),[server,setServer]=useState<Book[]>([]),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[online,setOnline]=useState(navigator.onLine);
 const lock=useRef(false),alive=useRef(true),requests=useRef(new Set<AbortController>()),change=useRef(onChange);change.current=onChange;
 const local=Object.values(doc.web.readingBooks||{}) as Book[],books=local.filter(b=>!b.deleted);
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
  const hash=await digest(await file.arrayBuffer()),previous=books.find(b=>b.hash===hash);
  const response=await request('/books',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:previous?.id||crypto.randomUUID(),name:file.name,size:file.size,hash})});
  let result=await response.json();if(result.state!=='ready')result=await(await request('/books/'+result.book.id,{method:'PUT',body:file})).json();
  if(!alive.current)return;
  // The cloud upload is durable before library metadata enters normal note sync.
  change.current(current=>registerBooks(current,[result.book]));
  try{await cachedBook(user!.uid,result.book.id+':'+hash,file);}catch{setNotice('Book uploaded. This browser could not cache an offline copy.');return;}
  setNotice('Book added and cached on this device.');
 });
 const getFile=(book:Book)=>run('Preparing book…',async()=>{
  if(!user)return;let blob=await cachedBook(user.uid,book.id+':'+book.hash);
  if(navigator.onLine){const list=await(await request('/books')).json();if(!list.books.some((b:Book)=>b.id===book.id&&b.hash===book.hash))throw Error('This book is no longer in cloud storage. Reimport the original file.');}
  if(!blob){if(!navigator.onLine)throw Error('Connect to download this book first.');blob=await(await request('/books/'+book.id)).blob();if(blob.size!==book.size||await digest(await blob.arrayBuffer())!==book.hash)throw Error('Book integrity check failed. Please try again.');try{await cachedBook(user.uid,book.id+':'+book.hash,blob);}catch{setNotice('Downloaded, but this browser could not retain an offline copy.');}}
  if(alive.current&&authenticatedUid()===user.uid)download(blob,book.name);
 });
 const remove=(book:Book)=>{if(!window.confirm('Delete “'+(book.title||book.name)+'” from book storage? This removes its cloud file. Download a copy first if you need it.'))return;void run('Deleting book…',async()=>{
  await request('/books/'+book.id,{method:'DELETE'});if(!alive.current)return;
  change.current(current=>({...current,web:{...current.web,readingBooks:{...current.web.readingBooks,[book.id]:{...current.web.readingBooks[book.id],deleted:true}}}}));
  try{await cachedBook(user!.uid,book.id+':'+book.hash,null);}catch{/* Remote deletion has succeeded; old cache is inaccessible through the deleted entry. */}setNotice('Book deleted. Its storage allocation has been released.');
 });};
 if(!user)return <section className="book-storage"><h3>Books and storage</h3><p>Sign in to keep PDF and EPUB originals privately in your account.</p><button className="action" disabled={disabled} onClick={()=>void onSignIn()}>Sign in to add books</button><p>Your device-only note attachments keep their existing limits: 2 MiB each and 20 MiB total.</p></section>;
 return <section className="book-storage" aria-label="Books and storage">
  <h3>A little room to read</h3><p>PDF and EPUB books up to 25 MiB each. Books and note attachments share 100 MiB per account.</p>
  {usage&&<div className="book-storage-meter"><div><strong>{mib(usage.total)} used</strong><span>of {mib(STORAGE_LIMIT)}</span></div><progress aria-label="Combined cloud storage" value={usage.total} max={STORAGE_LIMIT}/><small>Books and pending uploads: {mib(usage.books)} · Note attachments: {mib(usage.attachments)}</small></div>}
  {usage&&!usage.uploadsEnabled&&<p role="status">New book uploads are paused. Saved books, reading progress, and notes remain available.</p>}
  {!online&&<p role="status">You’re offline. Previously cached books are still available on this device.</p>}
  <label className="book-upload">Add a PDF or EPUB<input aria-label="Choose a PDF or EPUB book" type="file" accept=".pdf,.epub,application/pdf,application/epub+zip" disabled={disabled||!!busy||!online||!usage?.uploadsEnabled} onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file)void upload(file);}}/></label>
  <p className="book-storage-note">Books download when you open them and cache on this device. Workspace backups preserve reading metadata; download book originals separately here.</p>
  {books.length>0?<ul className="book-library">{books.map(book=><li key={book.id}><div><strong>{book.title||book.name}</strong><small>{book.format.toUpperCase()} · {mib(book.size)}{online&&!server.some(b=>b.id===book.id)?' · Original unavailable':''}</small></div><div><button className="action" disabled={disabled||!!busy} onClick={()=>void getFile(book)}>Download</button><button className="action" disabled={disabled||!!busy||!online} onClick={()=>remove(book)}>Delete</button></div></li>)}</ul>:<p className="book-storage-note">Your reading library is empty. Add a book to keep its original ready for the upcoming reader.</p>}
  {busy&&<p role="status">{busy}</p>}{error&&<p className="cloud-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 </section>;
}
