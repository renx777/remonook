// Separate, account-scoped cache: book binaries never enter the note asset map.
function open(uid:string):Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open('remo-books-'+uid,1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function cachedBook(uid:string,id:string,blob?:Blob|null):Promise<Blob|undefined>{
 const db=await open(uid);try{return await new Promise((resolve,reject)=>{const tx=db.transaction('files',blob===undefined?'readonly':'readwrite'),store=tx.objectStore('files');const r=blob===undefined?store.get(id):blob===null?store.delete(id):store.put(blob,id);let result:Blob|undefined;r.onsuccess=()=>{result=blob===undefined?r.result:blob||undefined;};tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(tx.error||Error('Book cache could not be saved.'));});}finally{db.close();}
}
