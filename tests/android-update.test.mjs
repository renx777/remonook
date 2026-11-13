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

import {textStats,notesInView,readTime,bookmarkStats,calendarStats} from '../src/view-stats.mjs';
test('statistics: words, characters, bullets and read time for the notes in view',()=>{
 const nodes=[{id:'a',parentId:null,position:0,text:'<b>Hello</b> world',taskState:'NONE'},{id:'b',parentId:'a',position:0,text:'one two three',taskState:'DONE'},{id:'c',parentId:null,position:1,text:'',taskState:'TODO'},{id:'d',parentId:null,position:2,text:'',blockStyle:'divider'}];
 assert.deepEqual(textStats(nodes),{words:5,characters:24,bullets:3,tasks:2,done:1,readTime:'1 s'});
 assert.deepEqual(notesInView(nodes,'a').map(n=>n.id).sort(),['a','b'],'a zoomed page counts itself and what is under it');
 assert.equal(readTime(230*3),'3 min');assert.equal(readTime(230*65),'1 h 5 min');
 assert.deepEqual(bookmarkStats({web:{bookmarks:{x:{read:true},y:{},z:{deleted:true}},webHighlights:{h:{}}}}),{saved:2,read:1,unread:1,highlights:1});
 assert.deepEqual(calendarStats([{dueDate:'2026-11-12',taskState:'DONE'},{journalDate:'2026-11-01'},{dueDate:'2026-10-30'}],'2026-11-12'),{entries:2,done:1,month:'2026-11'});
});
