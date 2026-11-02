// The durable store is shared by browser workers and the non-worker fallback.
export * from './data-store';
import {save as storeSave,syncOperation as storeSync,storageAccountKey,type Workspace} from './data-store';
import {runPersistence} from './persistence-client';
export async function save(before:Workspace|null,after:Workspace,operation:string,assets?:Map<string,Blob>,replace=false,removeAssets:string[]=[],adoptSyncState?:string):Promise<Workspace>{
 const account=storageAccountKey(),fallback=()=>storeSave(before,after,operation,assets,replace,removeAssets,adoptSyncState,account);
 if(!account.startsWith('remo-web-user-'))return fallback();
 const result=await runPersistence({kind:'save',account,args:[before,after,operation,assets,replace,removeAssets,adoptSyncState]},async()=>({revision:(await fallback()).revision}));
 // Only the revision changes on save. Preserve structural sharing in the live UI.
 return {...after,revision:result.revision};
}
export function syncOperation(operation:string,args:any={},account=storageAccountKey()):Promise<any>{
 return runPersistence({kind:'sync',operation,account,args},()=>storeSync(operation,args,account));
}
