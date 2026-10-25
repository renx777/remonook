import {storageAccountKey} from './data';
import { archive, digest, type Workspace } from './data';
export type FolderHandle = FileSystemDirectoryHandle & { values(): AsyncIterableIterator<FileSystemHandle>; queryPermission(options:{mode:'readwrite'}):Promise<PermissionState>; requestPermission(options:{mode:'readwrite'}):Promise<PermissionState> };
export type FolderCopy = { name:string; size:number; modified:number; previous:boolean; handle:FileSystemFileHandle };
export type FolderConnection = { handle:FolderHandle; expected:string|null; enabled:boolean; lastSaved:number };
export const folderSupported = () => typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function';
export async function chooseFolder():Promise<FolderHandle> { return (window as any).showDirectoryPicker({id:'remo-content',mode:'readwrite'}); }
const fileKey=(device:string)=>{if(!/^[a-z0-9_-]{1,100}$/i.test(device))throw Error('Invalid device identifier. Export a full backup before reconnecting a folder.');return 'device-'+device+'.remo.zip';};
const missing=(error:unknown)=>error instanceof Error&&error.name==='NotFoundError';
export async function readDeviceCopy(root:FolderHandle,device:string):Promise<File|null>{
 try {const dir=await root.getDirectoryHandle('Remo');return await (await dir.getFileHandle(fileKey(device))).getFile();}catch(error){if(missing(error))return null;throw error;}
}
export const fileDigest=async(file:Blob|null)=>file?digest(await file.arrayBuffer()):null;
export async function listFolderCopies(root:FolderHandle):Promise<FolderCopy[]> {
 let dir:FolderHandle;try{dir=await root.getDirectoryHandle('Remo') as FolderHandle;}catch(error){if(missing(error))return [];throw error;}
 const copies:FolderCopy[]=[];
 for await(const entry of dir.values()){
  if(entry.kind!=='file'||!/^device-[a-z0-9_.-]+\.zip$/i.test(entry.name)||entry.name.length>240)continue;
  if(copies.length>=200)throw Error('Too many Remo copies in this folder. Choose a folder with fewer than 200 copies.');
  const handle=entry as FileSystemFileHandle,file=await handle.getFile();
  copies.push({name:file.name,size:file.size,modified:file.lastModified,previous:file.name.includes('.previous.'),handle});
 }
 return copies.sort((a,b)=>b.modified-a.modified||a.name.localeCompare(b.name));
}
async function writeFile(dir:FileSystemDirectoryHandle,name:string,blob:Blob){
 const handle=await dir.getFileHandle(name,{create:true}),stream=await handle.createWritable();
 try{await stream.write(blob);await stream.close();}catch(error){try{await stream.abort();}catch{}throw error;}
}
/** Each browser owns a distinct file. Never overwrite another device's content. */
async function writeCopy(connection:FolderConnection,doc:Workspace,assets:Map<string,Blob>){
 const blob=await archive(doc,assets), current=await readDeviceCopy(connection.handle,doc.web.deviceId), actual=await fileDigest(current);
 if(actual!==connection.expected)throw Error('The folder copy changed outside Remo. Automatic saving is paused. Review and load the folder copy before continuing.');
 const dir=await connection.handle.getDirectoryHandle('Remo',{create:true}), name=fileKey(doc.web.deviceId);
 if(current)await writeFile(dir,name.replace('.remo.zip','.previous.remo.zip'),current);
 // Recheck after preserving the previous copy in case a sync arrived meanwhile.
 if(await fileDigest(await readDeviceCopy(connection.handle,doc.web.deviceId))!==actual)throw Error('The folder changed during saving. No new copy was written. Check folder updates.');
 await writeFile(dir,name,blob);
 return {hash:await fileDigest(blob),at:Date.now()};
}
export async function writeFolderCopy(connection:FolderConnection,doc:Workspace,assets:Map<string,Blob>){
 if(typeof navigator!=='undefined'&&navigator.locks?.request)return navigator.locks.request('remo-folder-'+doc.web.deviceId,()=>writeCopy(connection,doc,assets));
 return writeCopy(connection,doc,assets);
}
function db():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=indexedDB.open(storageAccountKey()==='remo-web'?'remo-folder-access':'remo-folder-access-'+storageAccountKey(),1);request.onupgradeneeded=()=>request.result.createObjectStore('settings');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
export async function rememberFolder(value:FolderConnection|null){const database=await db();try{await new Promise<void>((resolve,reject)=>{const tx=database.transaction('settings','readwrite');if(value)tx.objectStore('settings').put(value,'connection');else tx.objectStore('settings').delete('connection');tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error);});}finally{database.close();}}
export async function recalledFolder():Promise<FolderConnection|null>{const database=await db();try{return await new Promise((resolve,reject)=>{const request=database.transaction('settings','readonly').objectStore('settings').get('connection');request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);});}finally{database.close();}}
