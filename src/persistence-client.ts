type Task={kind:'save'|'sync';account:string;operation?:string;args:any};
let connection:ReturnType<typeof connect>|null=null;
function connect(){
 const worker=new Worker(new URL('./persistence-worker.ts',import.meta.url),{type:'module'});
 let sequence=0,started=false;
 const waiting=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();
 let resolveReady:()=>void,rejectReady:(e:Error)=>void;
 const ready=new Promise<void>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
 const timeout=setTimeout(()=>{if(!started){worker.terminate();rejectReady(Error('Background storage is unavailable.'));}},5000);
 worker.onmessage=event=>{
  if(event.data.ready){started=true;clearTimeout(timeout);resolveReady();return;}
  const job=waiting.get(event.data.id);if(!job)return;waiting.delete(event.data.id);
  if(event.data.error)job.reject(Object.assign(Error(event.data.error.message),event.data.error));else job.resolve(event.data.value);
 };
 worker.onerror=event=>{event.preventDefault();clearTimeout(timeout);worker.terminate();const error=Error('Background saving stopped. Your latest edits remain in this tab. Retry saving or export your work.');rejectReady(error);for(const job of waiting.values())job.reject(error);waiting.clear();if(started)connection=null;};
 return {async run(task:Task,fallback:()=>Promise<any>){
  // Falling back before a request is sent cannot repeat a committed transaction.
  try{await ready;}catch{return fallback();}
  return new Promise((resolve,reject)=>{const id=++sequence;waiting.set(id,{resolve,reject});try{worker.postMessage({id,...task});}catch(error){waiting.delete(id);reject(error);}});
 }};
}
export function runPersistence(task:Task,fallback:()=>Promise<any>):Promise<any>{
 if(typeof window==='undefined'||typeof Worker==='undefined')return fallback();
 try{connection??=connect();}catch{return fallback();}
 return connection.run(task,fallback);
}
