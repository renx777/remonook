import type {User} from 'firebase/auth';
import type {Workspace} from './data';
import {STORAGE_LIMIT} from './book-storage.mjs';
import {useBookLibrary} from './useBookLibrary';
import './book-storage.css';
const mib=(bytes:number)=>(bytes/1024/1024).toFixed(1)+' MiB';
export function BookStorage({user,doc,disabled,onChange,onSignIn,onRead}:{user:User|null;doc:Workspace;disabled:boolean;onChange:(update:(doc:Workspace)=>Workspace)=>void;onSignIn:()=>Promise<void>;onRead?:(hash:string)=>void}){
 const {usage,server,books,busy,error,notice,online,localMode,upload,getFile,remove}=useBookLibrary({user,doc,onChange});

 return <section className="book-storage" aria-label="Books and storage">
  <h3>A little room to read</h3><p>PDF and EPUB books up to 25 MiB each. {localMode?'Stored locally in this workspace; no account is required.':'Books and note attachments share 100 MiB per account.'}</p>
  {usage&&<div className="book-storage-meter"><div><strong>{mib(usage.total)} used</strong><span>of {mib(STORAGE_LIMIT)}</span></div><progress aria-label="Combined cloud storage" value={usage.total} max={STORAGE_LIMIT}/><small>Books and pending uploads: {mib(usage.books)} · Note attachments: {mib(usage.attachments)}</small></div>}
  {usage&&!usage.uploadsEnabled&&<p role="status">New book uploads are paused. Saved books, reading progress, and notes remain available.</p>}
  {!online&&!localMode&&<p role="status">You’re offline. Previously cached books are still available on this device.</p>}
  <label className="book-upload">Add a PDF or EPUB<input aria-label="Choose a PDF or EPUB book" type="file" accept=".pdf,.epub,application/pdf,application/epub+zip" disabled={disabled||!!busy||(!localMode&&(!online||!usage?.uploadsEnabled))} onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file)void upload(file);}}/></label>
  <p className="book-storage-note">{localMode?'Books stay in this workspace, work offline, and are included in full backups and workspace folders.':'Books download when you open them and cache on this device. Workspace backups preserve reading metadata; download book originals separately here.'}</p>
  {books.length>0?<ul className="book-library">{books.map(book=><li key={book.id}><div><strong>{book.title||book.name}</strong><small>{book.format.toUpperCase()} · {mib(book.size)}{!localMode&&online&&!server.some(b=>b.id===book.id)?' · Original unavailable':''}</small></div><div>{onRead&&<button className="action" disabled={!!busy} onClick={()=>onRead(book.hash)}>Read</button>}<button className="action" disabled={disabled||!!busy} onClick={()=>void getFile(book)}>Download</button><button className="action" disabled={disabled||!!busy||(!localMode&&!online)} onClick={()=>remove(book)}>Delete</button></div></li>)}</ul>:<p className="book-storage-note">Your reading library is empty. Add a book and make a little space to read.</p>}
  {busy&&<p role="status">{busy}</p>}{error&&<p className="cloud-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 </section>;
}
