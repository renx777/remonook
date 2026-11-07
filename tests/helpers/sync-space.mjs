// A Durable Object namespace for tests: each account's SyncSpace runs on its own node:sqlite database.
import {DatabaseSync} from 'node:sqlite';
import {SyncSpace} from '../../cloud/sync-v3.mjs';
export function syncSpaces(env){
 const live=new Map();
 const ctx=()=>{const db=new DatabaseSync(':memory:');return {db,getWebSockets:()=>[],storage:{sql:{exec(q,...p){const s=db.prepare(q);const rows=/^\s*(SELECT|WITH)/i.test(q)?s.all(...p):(s.run(...p),[]);return {toArray:()=>rows};}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}}};};
 return {live,idFromName:n=>n,get:id=>({fetch:(input,init)=>{if(!live.has(id))live.set(id,new SyncSpace(ctx(),env));return live.get(id).fetch(input instanceof Request?input:new Request(input,init));}})};
}
