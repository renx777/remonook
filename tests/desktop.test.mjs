import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
await build({entryPoints:['src/desktop.ts'],bundle:true,format:'esm',platform:'node',outfile:'tests/.build/desktop.mjs',logLevel:'silent'});
const d=await import('./.build/desktop.mjs');

test('desktop Google sign-in: the page only relays to a loopback port with the app state',()=>{
 const state='a'.repeat(48);
 assert.deepEqual(d.desktopSignInRequest(`?port=53123&state=${state}`),{port:53123,state});
 for(const bad of [`?port=80&state=${state}`,`?port=70000&state=${state}`,'?port=53123&state=short',`?port=53123&state=${'g'.repeat(48)}`,'?state='+state,''])assert.equal(d.desktopSignInRequest(bad),null,bad);
 const url=new URL(d.desktopCallback(53123,state,'h.p.s'));
 assert.equal(url.origin,'http://127.0.0.1:53123');assert.equal(url.pathname,'/callback');
 assert.equal(url.searchParams.get('state'),state);assert.equal(url.searchParams.get('id_token'),'h.p.s');
 assert.equal(d.desktopSignInSite('production'),'https://remonook.com');assert.equal(d.desktopSignInSite('staging'),'https://staging.remonook.com');
 assert.equal(d.isDesktop(),false,'not in the desktop app under Node');
});
