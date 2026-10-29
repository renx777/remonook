import {index} from './domain.mjs';
// React/workspace snapshots are immutable. Keep generic domain index() uncached
// for callers that are still constructing mutable arrays.
const snapshots=new WeakMap(),projections=new WeakMap();
export function snapshotIndex(nodes){let value=snapshots.get(nodes);if(!value){value=index(nodes);snapshots.set(nodes,value);}return value;}
export function paneSnapshot(nodes,collapsed){
 let views=projections.get(nodes);if(!views){views=new WeakMap();projections.set(nodes,views);}
 if(views.has(collapsed))return views.get(collapsed);
 let changed=false;const projected=nodes.map(node=>{if(collapsed[node.id]===undefined||collapsed[node.id]===node.collapsed)return node;changed=true;return {...node,collapsed:collapsed[node.id]};});
 const result=changed?projected:nodes;views.set(collapsed,result);return result;
}
