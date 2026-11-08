import test from 'node:test';
import assert from 'node:assert/strict';
import {route} from '../cloud/worker.mjs';

test('desktop updates: the sync Worker serves only files under desktop/<channel>/, without sign-in',async()=>{
 const objects=new Map([['desktop/staging/latest.json','{"version":"0.1.9"}'],['desktop/staging/RemoNook-Staging_0.1.9_x64-setup.exe','EXE'],['someone/private.txt','secret']]);
 const env={FILES:{async get(k){const v=objects.get(k);return v===undefined?null:{body:new Blob([v]).stream(),size:v.length};}}};
 const get=path=>route(new Request('https://sync.test'+path),env,async()=>{throw Error('no auth expected');}).catch(e=>Response.json({error:e.message},{status:e.status||500}));
 let r=await get('/desktop/staging/latest.json');assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'application/json');assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal(await r.text(),'{"version":"0.1.9"}');
 r=await get('/desktop/staging/RemoNook-Staging_0.1.9_x64-setup.exe');assert.equal(r.status,200);assert.match(r.headers.get('Cache-Control'),/immutable/);
 assert.equal((await get('/desktop/staging/missing.json')).status,404);
 for(const bad of ['/desktop/other/latest.json','/desktop/staging/../../someone/private.txt','/desktop/staging/%2e%2e%2fsomeone','/desktop/staging/'])assert.notEqual((await get(bad)).status,200,bad);
});
