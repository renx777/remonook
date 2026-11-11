import test from 'node:test';
import assert from 'node:assert/strict';
import {empty} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';
import {ensureLibrary,libraryTree,inFolder,moveLibraryItem,placeNewItem,LIBRARY_ID} from '../src/library-outline.mjs';

const sample=()=>{
 const doc=empty();
 doc.tables.bullets=[bullet('work',{text:'Work'}),bullet('research',{parentId:'work',text:'Research'}),bullet('old-root',{text:'Old article notes',position:1})];
 doc.web.bookmarks={a:{id:'a',url:'https://a.example/',title:'Spaced repetition',tags:[]},b:{id:'b',url:'https://b.example/',title:'Testing effect',tags:[]},gone:{id:'gone',url:'https://c.example/',title:'Deleted',tags:[],deleted:true}};
 doc.web.bookmarkNoteRoots={a:'old-root'};
 doc.web.readingBooks={x:{id:'x',hash:'f'.repeat(64),title:'Smart Notes',format:'pdf'}};
 return doc;
};

test('library: every item gets one bullet, deterministic, under Library at the top',()=>{
 const doc=ensureLibrary(sample()),ids=doc.tables.bullets.map(n=>n.id);
 const lib=doc.tables.bullets.find(n=>n.id===LIBRARY_ID);
 assert.equal(lib.parentId,null);assert.equal(lib.position,0);
 assert.equal(doc.web.bookmarkNoteRoots.a,'old-root','an existing notes bullet is kept where it is');
 assert.equal(doc.web.bookmarkNoteRoots.b,'web-b');
 assert.equal(doc.web.readingNoteRoots['f'.repeat(64)],'book-'+'f'.repeat(64));
 assert.ok(!ids.includes('web-gone'),'deleted bookmarks get nothing');
 assert.equal(doc.tables.bullets.find(n=>n.id==='web-b').parentId,LIBRARY_ID);
 // Another device doing the same produces the same bullets.
 assert.deepEqual(ensureLibrary(sample()).tables.bullets.map(n=>n.id).sort(),ids.slice().sort());
 assert.equal(ensureLibrary(doc),doc,'nothing to do the second time');
});

test('library: folders follow the outline; deleting an item bullet hides it; moving files it',()=>{
 let doc=ensureLibrary(sample());
 doc=moveLibraryItem(doc,'web-b','research');
 let tree=libraryTree(doc,'bookmark');
 assert.deepEqual([...tree.folders.keys()],['work','research']);
 assert.equal(tree.folders.get('work').count,1);
 assert.ok(inFolder(tree,'b','work')&&inFolder(tree,'b','research'));
 assert.deepEqual(tree.unsorted,['a'],'a top-level notes bullet counts as not organized yet');
 // Deleting b's bullet in Notes: b disappears from Bookmarks (it is in Trash with the bullet).
 doc={...doc,tables:{...doc.tables,bullets:doc.tables.bullets.filter(n=>n.id!=='web-b')}};
 tree=libraryTree(doc,'bookmark');
 assert.deepEqual(tree.visible.map(i=>i.key),['a']);
 assert.equal(ensureLibrary(doc).tables.bullets.some(n=>n.id==='web-b'),false,'a deleted bullet is not recreated');
 // A bookmark saved while a folder is open goes there.
 doc.web.bookmarks.n={id:'n',url:'https://n.example/',title:'New',tags:[]};
 doc=placeNewItem(ensureLibrary(doc),'bookmark','n','research');
 assert.equal(doc.tables.bullets.find(n=>n.id==='web-n').parentId,'research');
 assert.throws(()=>moveLibraryItem(doc,'work','research'),/inside/);
});

test('library: the first run restores bullets removed before this existed',()=>{
 const doc=sample();doc.web.bookmarkNoteRoots={a:'missing-root'};
 const next=ensureLibrary(doc);
 assert.equal(next.web.bookmarkNoteRoots.a,'web-a');
 assert.equal(next.web.libraryVersion,1);
});
