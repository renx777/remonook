import type {User} from 'firebase/auth';
import {authenticatedUid} from './CloudAccount';
import {CLOUD_API} from './cloud-config';
export async function aiRequest(user:User|null,path:string,body:unknown,signal:AbortSignal,onEvent?:(event:any)=>void){
 if(!user||authenticatedUid()!==user.uid)throw Error('Sign in to use AI assist.');
 const verify=()=>{if(signal.aborted||authenticatedUid()!==user.uid)throw new DOMException('AI request cancelled.','AbortError');};
 const token=await user.getIdToken();verify();
 const response=await fetch(CLOUD_API+'/ai/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal,cache:'no-store'});verify();
 if(!response.ok){const v=await response.json();verify();throw Error(v.error||'AI is unavailable. Try again.');}
 if(!response.headers.get('Content-Type')?.includes('application/x-ndjson')){const v=await response.json();verify();if(v.result)onEvent?.({type:'done',...v});return v;}
 const reader=response.body!.getReader(),decoder=new TextDecoder();let buffer='',done=false;
 try{for(;;){const chunk=await reader.read();verify();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});if(buffer.length>100000)throw Error('AI returned too much text.');const lines=buffer.split('\n');buffer=lines.pop()||'';for(const line of lines){if(!line.trim())continue;const e=JSON.parse(line);if(e.type==='error')throw Error(e.error);if(e.type==='done')done=true;onEvent?.(e);}}if(!done)throw Error('The preview was interrupted. Your draft is kept.');}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
