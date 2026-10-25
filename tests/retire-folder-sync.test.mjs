import {test} from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {legacyFolderDatabaseName,retireLegacyFolderSync} from '../src/retire-folder-sync.mjs';

const openLegacy = async name => new Promise((resolve,reject)=>{
 const request=indexedDB.open(name,1);
 request.onupgradeneeded=()=>request.result.createObjectStore('settings');
 request.onsuccess=()=>resolve(request.result);
 request.onerror=()=>reject(request.error);
});
const put = async (db,key,value)=>new Promise((resolve,reject)=>{
 const tx=db.transaction('settings','readwrite');
 tx.objectStore('settings').put(value,key);
 tx.oncomplete=resolve;
 tx.onerror=tx.onabort=()=>reject(tx.error);
});
const get = async (db,key)=>new Promise((resolve,reject)=>{
 const request=db.transaction('settings','readonly').objectStore('settings').get(key);
 request.onsuccess=()=>resolve(request.result);
 request.onerror=()=>reject(request.error);
});

test('legacy folder connection is disconnected for guest and account without deleting file copies',async()=>{
 const guest=legacyFolderDatabaseName('remo-web');
 const account=legacyFolderDatabaseName('remo-web-user-test-sync-account');
 assert.notEqual(guest,account);
 for(const name of [guest,account]){
   const db=await openLegacy(name);
   await put(db,'connection',{enabled:true,handle:{name:'Existing folder'}});
   await put(db,'unrelated','preserve');
   db.close();
 }
 assert.equal(await retireLegacyFolderSync('remo-web'),true);
 let db=await openLegacy(guest);
 assert.equal(await get(db,'connection'),undefined);
 assert.equal(await get(db,'unrelated'),'preserve');
 db.close();
 db=await openLegacy(account);
 assert.equal((await get(db,'connection')).enabled,true,'account scope remains unchanged by guest cleanup');
 db.close();
 assert.equal(await retireLegacyFolderSync('remo-web-user-test-sync-account'),true);
 db=await openLegacy(account);
 assert.equal(await get(db,'connection'),undefined);
 assert.equal(await get(db,'unrelated'),'preserve');
 db.close();
 assert.equal(await retireLegacyFolderSync('remo-web-user-test-sync-account'),true,'cleanup is idempotent');
});

test('new devices do not need to create or choose a local folder',async()=>{
 const unknown=legacyFolderDatabaseName('remo-web-user-new-device');
 assert.equal(await retireLegacyFolderSync('remo-web-user-new-device'),false);
 const names=await indexedDB.databases();
 assert.equal(names.some(db=>db.name===unknown),false,'no obsolete database created for a new account');
});
