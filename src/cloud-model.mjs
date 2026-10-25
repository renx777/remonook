// Revision and device identity belong to a browser, not the shared content.
export function cloudDocument(doc){const {revision,...rest}=doc;const {deviceId,...web}=rest.web;return {...rest,web};}
export const contentKey=doc=>JSON.stringify(cloudDocument(doc));
export function syncDecision(checkpoint,localKey,remoteRevision){
 if(!checkpoint)return remoteRevision===0?'upload':'download';
 if(remoteRevision===checkpoint.revision)return localKey===checkpoint.key?'idle':'upload';
 return localKey===checkpoint.key?'download':'conflict';
}
