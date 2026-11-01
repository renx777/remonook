import test from 'node:test';import assert from 'node:assert/strict';import 'fake-indexeddb/auto';
import {empty,withNodes,setStorageAccount,save,load,syncMetadata,syncOperation,cloudCheckpoint} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';import {seed,sharedState} from '../src/sync-crdt.mjs';import {cloudDocument} from '../src/cloud-model.mjs';
test('an asynchronous save and sync operation retain their original account across an account switch',async()=>{
 const a='persist-a-'+crypto.randomUUID(),b='persist-b-'+crypto.randomUUID(),keyA='remo-web-user-'+a,keyB='remo-web-user-'+b;
 try{
  setStorageAccount(a);const da=withNodes(empty(),[bullet('same-id',{text:'Account A'})]),pa=save(null,da,'edit');
  setStorageAccount(b);const db=withNodes(empty(),[bullet('same-id',{text:'Account B'})]),pb=save(null,db,'edit');
  const[sa,sb]=await Promise.all([pa,pb]);assert.equal(sa.tables,da.tables,'an acknowledged save must preserve UI references');assert.equal(sb.tables,db.tables);assert.equal((await load(keyA)).tables.bullets[0].text,'Account A');assert.equal((await load(keyB)).tables.bullets[0].text,'Account B');
  const y=seed(sa);try{await cloudCheckpoint({baseDoc:cloudDocument(sa)},keyA);await syncOperation('initialize',{response:{protocol:2,update:sharedState(y),revision:1},doc:sa,assets:[]},keyA);}finally{y.destroy();}
  assert.equal((await syncOperation('status',{},keyA)).initialized,true);assert.equal((await syncOperation('status',{},keyB)).initialized,false);assert.equal(await syncMetadata(),null,'current account B must not receive account A metadata');
 }finally{setStorageAccount(null);}
});
