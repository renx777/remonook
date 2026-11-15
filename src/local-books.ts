// Device-local originals are separate from cloud books and ordinary note attachments.
import {cachedBook} from './book-cache';
import {storageAccountKey,digest,type Workspace} from './data-store';
import {BOOK_TYPES} from './book-storage.mjs';

export const localBookScope=(storage=storageAccountKey())=>'local:'+storage;
export const bookScope=(uid?:string,storage=storageAccountKey())=>uid||localBookScope(storage);
export const bookPath=(book:any)=>'books/'+book.hash+'.'+book.format;
export const isBookPath=(path:string)=>/^books\/[a-f0-9]{64}\.(pdf|epub)$/.test(path);
export const localBookManifest=(doc:Pick<Workspace,'web'>)=>Object.values(doc.web.readingBooks||{}).filter((b:any)=>!b.deleted).map((b:any)=>({path:bookPath(b),hash:b.hash,size:b.size,type:BOOK_TYPES[b.format as keyof typeof BOOK_TYPES]}));
export async function localBookFiles(doc:Pick<Workspace,'web'>,storage=storageAccountKey()){
 const files=new Map<string,Blob>();
 if(typeof indexedDB==='undefined')return files;
 for(const book of Object.values(doc.web.readingBooks||{}) as any[])if(!book.deleted){const blob=await cachedBook(localBookScope(storage),book.id+':'+book.hash);if(blob)files.set(bookPath(book),blob);}
 return files;
}
export async function restoreLocalBook(doc:Pick<Workspace,'web'>,storage:string,path:string,blob:Blob){
 if(!isBookPath(path))return false;
 const books=(Object.values(doc.web.readingBooks||{}) as any[]).filter(b=>!b.deleted&&bookPath(b)===path);
 if(!books.length)return false;
 if(books.some(b=>b.size!==blob.size)||await digest(await blob.arrayBuffer())!==books[0].hash)throw Error('Book integrity check failed. The existing original was kept.');
 for(const b of books)await cachedBook(localBookScope(storage),b.id+':'+b.hash,blob);
 window.dispatchEvent(new CustomEvent('remo-local-books',{detail:storage}));
 return true;
}
