import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
await build({entryPoints:['src/AndroidUpdate.tsx'],bundle:true,format:'esm',platform:'node',packages:'external',outfile:'tests/.build/android-update.mjs',logLevel:'silent',define:{'import.meta.env':'{}'}});
const {newer}=await import('./.build/android-update.mjs');

test('Android update: only a newer build is offered',()=>{
 assert.equal(newer('0.1.21','0.1.20'),true);
 assert.equal(newer('0.1.100','0.1.99'),true,'numeric, not text, comparison');
 assert.equal(newer('0.1.20','0.1.20'),false);
 assert.equal(newer('0.1.19','0.1.20'),false);
 assert.equal(newer('0.2','0.1.99'),true);
});
