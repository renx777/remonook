import {useEffect,useRef,useState} from 'react';
import type {Workspace} from './data';
import {chooseFolder,folderSupported,recalledFolder,rememberFolder,listFolderCopies,readDeviceCopy,fileDigest,writeFolderCopy,type FolderConnection,type FolderCopy} from './folder-store';

type Snapshot={doc:Workspace|null;assets:Map<string,Blob>};
export function useFolderStorage({revision,saved,getSnapshot,flush,onImport}:{revision:number|undefined;saved:boolean;getSnapshot:()=>Snapshot;flush:()=>Promise<unknown>;onImport:(file:File)=>Promise<void>}){
 const connection=useRef<FolderConnection|null>(null),latest=useRef({getSnapshot,flush,onImport});latest.current={getSnapshot,flush,onImport};
 const [name,setName]=useState(''),[message,setMessage]=useState('No folder connected'),[copies,setCopies]=useState<FolderCopy[]>([]),[busy,setBusy]=useState(false),[enabled,setEnabled]=useState(false),[permission,setPermission]=useState(false);
 const active=useRef(false), pending=useRef(false), mounted=useRef(true), generation=useRef(0), lastRevision=useRef(-1);
 const restoring=useRef(false),inFlight=useRef<Promise<void>>(Promise.resolve());
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;};},[]);
 const scan=async()=>{if(!connection.current)return;try{setCopies(await listFolderCopies(connection.current.handle));}catch(error){setMessage(String(error));}};
 useEffect(()=>{let live=true;void recalledFolder().then(async value=>{
  if(!live||!value)return;connection.current=value;setName(value.handle.name);setEnabled(false);
  const granted=await value.handle.queryPermission({mode:'readwrite'});if(!live)return;
  if(granted==='granted'){setPermission(true);setEnabled(value.enabled);setMessage(value.enabled?'Folder ready · saving after local edits':'Folder connected · automatic saving is off');setCopies(await listFolderCopies(value.handle));}
  else setMessage('Reconnect folder to allow saving again');
 }).catch(()=>{});return()=>{live=false;};},[]);
 const runWrite=async(manual=false)=>{
  if(restoring.current)return;
  const selected=connection.current;if(!selected||!permission||(!manual&&!selected.enabled))return;
  if(active.current){pending.current=true;return;}
  active.current=true;setBusy(true);const token=generation.current;
  try{do{
   pending.current=false;await latest.current.flush();const snapshot=latest.current.getSnapshot();if(!snapshot.doc)throw Error('Open a workspace first.');
   if(!manual&&snapshot.doc.revision===lastRevision.current)break;
   setMessage('Saving complete copy to folder…');const result=await writeFolderCopy(selected,snapshot.doc,snapshot.assets);
   if(token!==generation.current)break;
   selected.expected=result.hash;selected.lastSaved=result.at;lastRevision.current=snapshot.doc.revision;
   await rememberFolder(selected);if(mounted.current){setMessage('Saved to folder · '+new Date(result.at).toLocaleTimeString());setCopies(await listFolderCopies(selected.handle));}
  }while(pending.current&&token===generation.current);}catch(error){selected.enabled=false;setEnabled(false);setMessage(error instanceof Error?error.message:String(error));await rememberFolder(selected).catch(()=>{});}finally{active.current=false;if(mounted.current)setBusy(false);}
 };
 const write=(manual=false)=>{if(active.current){pending.current=true;return inFlight.current;}const work=runWrite(manual);inFlight.current=work;return work;};
 useEffect(()=>{if(!saved||!enabled||!permission||revision===undefined)return;const timer=setTimeout(()=>void write(),1800);return()=>clearTimeout(timer);},[revision,saved,enabled,permission]);
 useEffect(()=>{if(!permission||!name)return;const timer=setInterval(()=>void scan(),20000);const check=()=>{if(!document.hidden)void scan();};document.addEventListener('visibilitychange',check);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',check);};},[permission,name]);
 const connect=async()=>{
  try{const handle=await chooseFolder();await latest.current.flush();const doc=latest.current.getSnapshot().doc;if(!doc)throw Error('Open notes first.');
   generation.current++;const value={handle,expected:await fileDigest(await readDeviceCopy(handle,doc.web.deviceId)),enabled:false,lastSaved:0};
   connection.current=value;lastRevision.current=-1;await rememberFolder(value);setName(handle.name);setPermission(true);setEnabled(false);setMessage('Folder connected. Start automatic saving, or load an existing copy below.');setCopies(await listFolderCopies(handle));
  }catch(error){if((error as Error).name!=='AbortError')setMessage(error instanceof Error?error.message:String(error));}
 };
 const reconnect=async()=>{try{const selected=connection.current;if(!selected)return;const result=await selected.handle.requestPermission({mode:'readwrite'});if(result!=='granted')throw Error('Folder permission was not granted. Browser notes are still saved.');setPermission(true);setMessage('Folder reconnected. Start saving or check existing copies.');await scan();}catch(error){setMessage(String(error));}};
 const start=async()=>{const selected=connection.current;if(!selected)return;selected.enabled=true;setEnabled(true);await rememberFolder(selected);await write(true);};
 const disconnect=async()=>{generation.current++;if(connection.current)connection.current.enabled=false;connection.current=null;await rememberFolder(null);setName('');setCopies([]);setEnabled(false);setPermission(false);setMessage('Folder disconnected. Files remain in place.');};
 const restored=async()=>{const selected=connection.current,doc=latest.current.getSnapshot().doc;if(!selected||!doc)return;try{selected.expected=await fileDigest(await readDeviceCopy(selected.handle,doc.web.deviceId));lastRevision.current=-1;await rememberFolder(selected);}catch(error){selected.enabled=false;setEnabled(false);setMessage('Browser copy restored. Folder saving is paused: '+String(error));}};
 return {supported:folderSupported(),name,message,copies,busy,pending:enabled&&revision!==lastRevision.current,enabled,permission,connect,reconnect,start,disconnect,scan,write:()=>write(true),restored,beforeRestore:async()=>{restoring.current=true;await inFlight.current;},endRestore:()=>{restoring.current=false;},open:async(copy:FolderCopy)=>{try{await latest.current.onImport(await copy.handle.getFile());}catch(error){setMessage(String(error));}}};
}
export function FolderStoragePanel({model}:{model:ReturnType<typeof useFolderStorage>}){
 return <section className="folder-storage" aria-label="Local content folder"><h3>Content folder</h3><p className="dialog-muted">Automatically save notes, images, emojis, decks and study progress to a folder. Add that folder to Syncthing on your devices. Remo writes into its own <strong>Remo</strong> subfolder.</p>
 {!model.supported?<p className="dialog-muted">This browser cannot keep a writable folder connection. Use desktop Chrome or Edge for folder saving, or use Download full backup and Restore from backup here.</p>:<button className="wide action" disabled={model.busy} onClick={()=>void model.connect()}>{model.name?'Choose another folder…':'Choose content folder…'}</button>}
 {model.name&&<><p><strong>{model.name} / Remo</strong></p>{!model.permission?<button className="wide action" onClick={()=>void model.reconnect()}>Reconnect folder</button>:<div className="folder-actions"><button disabled={model.busy} onClick={()=>void(model.enabled?model.write():model.start())}>{model.enabled?'Save folder copy now':'Start automatic folder saving'}</button><button disabled={model.busy} onClick={()=>void model.scan()}>Check folder updates</button></div>}<button className="study-text-button" disabled={model.busy} onClick={()=>void model.disconnect()}>Disconnect folder</button></>}
 <p role="status" className="dialog-muted">{model.message}</p>
 {!!model.copies.length&&<><h4>Available copies</h4><p className="dialog-muted">Each device keeps a separate complete copy and its previous version. To switch devices, wait for Syncthing, check updates, then load the copy you want. Loading requires review and keeps a recovery copy of your current browser data. Changes from two devices are not automatically merged.</p><ul className="folder-copy-list">{model.copies.map(copy=><li key={copy.name}><span><strong>{copy.previous?'Previous copy':'Device copy'}</strong><small>{copy.name}</small><small>{new Date(copy.modified).toLocaleString()} · {(copy.size/1024/1024).toFixed(1)} MB</small></span><button disabled={model.busy} onClick={()=>void model.open(copy)}>Review & load</button></li>)}</ul></>}
 </section>;
}
