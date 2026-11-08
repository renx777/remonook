import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
await build({entryPoints:['src/workspaces.ts'],bundle:true,format:'esm',platform:'node',outfile:'tests/.build/workspaces.mjs',logLevel:'silent'});
const dom=new JSDOM('',{url:'https://remonook.com'});Object.defineProperty(globalThis,'localStorage',{value:dom.window.localStorage,configurable:true});
const w=await import('./.build/workspaces.mjs');

test('device-only workspaces: create, choose, rename, ignore bad entries, delete', async()=>{
 localStorage.clear();
 assert.equal(w.activeLocalWorkspace(),null,'the main workspace opens by default');
 assert.throws(()=>w.createLocalWorkspace('   '),/name/);
 const a=w.createLocalWorkspace('  Private   journal '),b=w.createLocalWorkspace('Drafts');
 assert.equal(a.name,'Private journal');assert.match(w.workspaceStorageName(a),/^remo-web-local-[a-z0-9]{16}$/);
 w.chooseWorkspace({local:a.id});assert.equal(w.activeLocalWorkspace().id,a.id);
 w.renameLocalWorkspace(a.id,'Journal');assert.equal(w.activeLocalWorkspace().name,'Journal');
 localStorage.setItem('remo-local-workspaces',JSON.stringify([...w.localWorkspaces(),{id:'../evil',name:'x'},{id:'abcdefgh12',name:''}]));
 assert.deepEqual(w.localWorkspaces().map(x=>x.name),['Journal','Drafts'],'malformed entries are ignored');
 localStorage.setItem(w.workspaceStorageName(a)+':setting','1');
 globalThis.indexedDB={deleteDatabase(){const r={};setTimeout(()=>r.onsuccess?.());return r;}};
 await w.deleteLocalWorkspace(a.id);
 assert.equal(w.activeLocalWorkspace(),null,'deleting the open workspace returns to the main one');
 assert.deepEqual(w.localWorkspaces().map(x=>x.name),['Drafts']);
 assert.equal(localStorage.getItem(w.workspaceStorageName(a)+':setting'),null,'its device settings are removed');
 w.chooseWorkspace({local:'nonexistent0'});assert.equal(w.activeLocalWorkspace(),null,'an unknown choice falls back to the main workspace');
});
