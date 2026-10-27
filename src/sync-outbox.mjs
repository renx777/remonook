import {Y,openShared,sharedState,vector,delta,pack,unpack,applyIntent,project} from './sync-crdt.mjs';
import {cloudDocument} from './cloud-model.mjs';
import {catalogAssetPaths} from './emoji-catalog.mjs';
const actor=new Y.Doc(),sessionClient=actor.clientID;actor.destroy();
const localDoc=state=>{const d=openShared(state);d.clientID=sessionClient;return d;};
function queued(meta,d,v){
 const update=delta(d,v);meta.localState=sharedState(d);
 if(unpack(update).length>2){meta.pending.push({id:crypto.randomUUID(),update});const r=openShared(meta.receivedState);Y.applyUpdate(r,unpack(update));meta.receivedState=sharedState(r);r.destroy();}
}
export function initializeOutbox(state,revision,baseline,doc,assets,baseAssets=[]){
 const meta={protocol:2,localState:state,receivedState:state,mappedDoc:cloudDocument(doc),assets:baseAssets,pending:[],inflight:null,serverRevision:revision};
 const d=localDoc(state),v=vector(d);meta.uploaded=project(d).assets.map(a=>a.hash);
 // A fresh account/device with no authored data simply adopts the server seed.
 if(baseline){applyIntent(d,baseline,doc,baseAssets,assets,true);queued(meta,d,v);}
 meta.assets=assets;d.destroy();return meta;
}
export function recordLocal(meta,doc){const d=localDoc(meta.localState),v=vector(d);applyIntent(d,meta.mappedDoc,doc,meta.assets,meta.assets);queued(meta,d,v);meta.mappedDoc=cloudDocument(doc);d.destroy();return meta;}
export function stageAssets(meta,assets){
 const d=localDoc(meta.localState),v=vector(d),next=new Map(assets.map(a=>[a.path,a])),prior=new Map(meta.assets.map(a=>[a.path,a]));
 // Absence from an incomplete browser cache is not deletion of an emoji that
 // still exists in the document. Keep its cloud manifest so it can download.
 const emojis=(meta.mappedDoc.tables.emojis||[]).filter(e=>typeof e.fileName==='string'),referenced=new Set(emojis.flatMap(catalogAssetPaths));
 for(const a of [...project(d).assets,...meta.assets])if(referenced.has(a.path)&&!next.has(a.path)){next.set(a.path,a);prior.set(a.path,a);}
 const effective=[...next.values()].sort((a,b)=>a.path.localeCompare(b.path));
 applyIntent(d,meta.mappedDoc,meta.mappedDoc,[...prior.values()],effective);queued(meta,d,v);meta.assets=effective;d.destroy();return meta;
}
export function claimOutbox(meta){
 if(!meta.inflight&&meta.pending.length){const batch=meta.pending.slice(0,64);const d=openShared(meta.receivedState);meta.inflight={operationId:crypto.randomUUID(),ids:batch.map(x=>x.id),update:pack(Y.mergeUpdates(batch.map(x=>unpack(x.update)))),vector:vector(d)};d.destroy();}
 return meta;
}
export function receiveOutbox(meta,response){
 if(response.protocol!==2||!Number.isSafeInteger(response.revision)||response.revision<0)throw Error('Invalid sync response');
 const d=openShared(meta.receivedState);Y.applyUpdate(d,unpack(response.update));meta.receivedState=sharedState(d);d.destroy();
 meta.serverRevision=Math.max(meta.serverRevision,response.revision);
 if(response.acked){if(response.acked!==meta.inflight?.operationId)throw Error('Unexpected sync acknowledgement');const ids=new Set(meta.inflight.ids);meta.pending=meta.pending.filter(x=>!ids.has(x.id));meta.inflight=null;}
 return meta;
}
