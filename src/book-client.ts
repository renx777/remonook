import type {User} from 'firebase/auth';
import {authenticatedUid} from './CloudAccount';
import {CLOUD_API} from './cloud-config';
import {storageAccountKey} from './data-store';
import {bookScope} from './local-books';
import {cachedBook} from './book-cache';
export async function loadReadingFile(user:User|null,book:any,signal:AbortSignal){
 const storage=storageAccountKey(),scope=bookScope(user?.uid,storage);
 const verify=()=>{if(signal.aborted||storageAccountKey()!==storage||user&&authenticatedUid()!==user.uid)throw new DOMException('Reading request cancelled.','AbortError');};
 verify();let resolved=book,blob=await cachedBook(scope,book.id+':'+book.hash);verify();
 if(!user){if(!blob)throw Error('The original is not available on this device. Reimport it or open its workspace folder.');const {digest}=await import('./data-store');if(blob.size!==book.size||await digest(await blob.arrayBuffer())!==book.hash)throw Error('Book integrity check failed. Reimport the original.');verify();return {blob,book};}
 const request=async(path:string,timeout=8000)=>{verify();const token=await user.getIdToken();verify();const response=await fetch(CLOUD_API+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.any([signal,AbortSignal.timeout(timeout)]),cache:'no-store'});if(!response.ok){const value=await response.json().catch(()=>({}));throw Object.assign(Error(value.error||'The original book is unavailable. Reimport it in Settings → Storage.'),{status:response.status});}return response;};
 if(navigator.onLine){
  try{const {books}=await(await request('/books')).json();resolved=books.find((b:any)=>b.hash===book.hash);if(!resolved)throw Object.assign(Error('The original was removed. Your captured notes are still available. Reimport the book in Settings → Storage.'),{status:410});}
  catch(error){verify();const status=(error as any).status;if(!blob||status&&status<500&&![408,429].includes(status))throw error;/* An unreachable server must not prevent reading a trusted local copy. */}
 }
 if(resolved.id!==book.id){const current=await cachedBook(user.uid,resolved.id+':'+resolved.hash);if(current)blob=current;else if(blob)try{await cachedBook(user.uid,resolved.id+':'+resolved.hash,blob);}catch{}}verify();
 if(!blob){if(!navigator.onLine)throw Error('Open this book once while online to read it offline.');blob=await(await request('/books/'+resolved.id,10*60000)).blob();verify();const bytes=await blob.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');verify();if(blob.size!==resolved.size||hash!==resolved.hash)throw Error('The book could not be verified. Try opening it again.');try{await cachedBook(user.uid,resolved.id+':'+resolved.hash,blob);}catch{/* Reading remains available when a browser cannot retain a cache. */}}
 verify();return {blob,book:resolved};
}
