import test from 'node:test';
import assert from 'node:assert/strict';
import {empty} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';
import {ensureItem,libraryTree,inFolder,moveLibraryItem,placeNewItem,LIBRARY_ID} from '../src/library-outline.mjs';

const sample=()=>{
 const doc=empty();
 doc.tables.bullets=[bullet('work',{text:'Work'}),bullet('research',{parentId:'work',text:'Research'}),bullet('old-root',{text:'Old article notes',position:1})];
 doc.web.bookmarks={a:{id:'a',url:'https://a.example/',title:'Spaced repetition',tags:[]},b:{id:'b',url:'https://b.example/',title:'Testing effect',tags:[]},gone:{id:'gone',url:'https://c.example/',title:'Deleted',tags:[],deleted:true}};
 doc.web.bookmarkNoteRoots={a:'old-root'};
 doc.web.readingBooks={x:{id:'x',hash:'f'.repeat(64),title:'Smart Notes',format:'pdf'}};
 return doc;
};

test('library: nothing is added to Notes until an item is filed',()=>{
 const doc=sample(),tree=libraryTree(doc,'bookmark');
 assert.deepEqual(tree.visible.map(i=>i.key).sort(),['a','b']);
 assert.deepEqual(tree.unsorted.sort(),['a','b'],'unfiled items are not organized yet');
 assert.equal(placeNewItem(doc,'bookmark','b',null),doc,'saving outside a folder adds no bullet');
 assert.equal(placeNewItem(doc,'bookmark','b','unsorted'),doc);
 assert.equal(libraryTree(doc,'book').visible.length,1);
});

test('library: filing creates one deterministic bullet; Library is added last, moving nothing',()=>{
 const doc=moveLibraryItem(sample(),'bookmark','b',null);
 const lib=doc.tables.bullets.find(n=>n.id===LIBRARY_ID);
 assert.equal(lib.parentId,null);assert.equal(lib.position,2,'after the existing top-level bullets');
 assert.equal(doc.tables.bullets.find(n=>n.id==='work').position,0,'other bullets keep their places');
 assert.equal(doc.web.bookmarkNoteRoots.b,'web-b');
 assert.equal(doc.tables.bullets.find(n=>n.id==='web-b').parentId,LIBRARY_ID);
 assert.equal(doc.tables.bullets.length,5);
 assert.deepEqual(moveLibraryItem(sample(),'bookmark','b',null).tables.bullets.map(n=>n.id).sort(),doc.tables.bullets.map(n=>n.id).sort(),'another device makes the same bullets');
 assert.equal(ensureItem(doc,'bookmark','b'),doc,'nothing to do the second time');
 // Filing straight into a folder needs no Library bullet.
 const direct=moveLibraryItem(sample(),'book','f'.repeat(64),'research');
 assert.equal(direct.tables.bullets.find(n=>n.id==='book-'+'f'.repeat(64)).parentId,'research');
 assert.ok(!direct.tables.bullets.some(n=>n.id===LIBRARY_ID));
 // An existing notes bullet is moved, not replaced.
 const a=moveLibraryItem(sample(),'bookmark','a','research');
 assert.equal(a.web.bookmarkNoteRoots.a,'old-root');assert.equal(a.tables.bullets.find(n=>n.id==='old-root').parentId,'research');
});

test('library: folders follow the outline; a bullet in Trash hides its item',()=>{
 let doc=moveLibraryItem(sample(),'bookmark','b','research');
 let tree=libraryTree(doc,'bookmark');
 assert.deepEqual([...tree.folders.keys()],['work','research']);
 assert.equal(tree.folders.get('work').count,1);
 assert.ok(inFolder(tree,'b','work')&&inFolder(tree,'b','research'));
 assert.deepEqual(tree.unsorted,['a'],'a top-level notes bullet counts as not organized yet');
 // b's bullet deleted in Notes (now in Trash): b is hidden.
 const removed=doc.tables.bullets.find(n=>n.id==='web-b');
 doc={...doc,tables:{...doc.tables,bullets:doc.tables.bullets.filter(n=>n.id!=='web-b'),trash:[{id:'t1',nodes:[removed]}]}};
 assert.deepEqual(libraryTree(doc,'bookmark').visible.map(i=>i.key),['a']);
 // Gone for good (Trash emptied): b is back, not organized.
 doc={...doc,tables:{...doc.tables,trash:[]}};
 tree=libraryTree(doc,'bookmark');
 assert.deepEqual(tree.visible.map(i=>i.key).sort(),['a','b']);assert.ok(tree.unsorted.includes('b'));
 // A bookmark saved while a folder is open goes there.
 doc.web.bookmarks.n={id:'n',url:'https://n.example/',title:'New',tags:[]};
 doc=placeNewItem(doc,'bookmark','n','research');
 assert.equal(doc.tables.bullets.find(n=>n.id==='web-n').parentId,'research');
 assert.throws(()=>moveLibraryItem(doc,'bookmark','n','web-n'),/inside/);
 assert.throws(()=>moveLibraryItem(doc,'bookmark','n','nope'),/no longer exists/);
});
