import test from 'node:test';
import assert from 'node:assert/strict';
import {empty} from './.build/data.mjs';
import {bullet,encode,marks} from '../src/domain.mjs';
import {seed,project} from '../src/sync-crdt.mjs';
import {parseTraitRow,addTraitsBlock,addTraitRow,setTraitRow,noteTraits,noteTrait,traitKind,setTraitKind,inferTraitKind,normaliseTraitValue,hasTraitsTag,traitsBlocks,freshTraitKey,knownTraitKeys,collectionTraitKeys,traitCover,insideTraits} from '../src/traits-block.mjs';

let n=0;const make=()=>'id'+(++n);
const doc=(bullets)=>{const d=empty();return {...d,tables:{...d.tables,bullets}};};
const book=()=>doc([bullet('b',{parentId:null,position:0,text:'Atomic Habits - James Clear #Traits'}),bullet('c',{parentId:'b',position:0,text:'Existing child'})]);

test('#traits (any case) adds a collapsible Traits child first and removes the tag', ()=>{
  const d0=book();assert.ok(hasTraitsTag(d0.tables.bullets[0]));
  const {doc:d,block}=addTraitsBlock(d0,'b',make);
  const kids=d.tables.bullets.filter(x=>x.parentId==='b').sort((a,b)=>a.position-b.position);
  assert.deepEqual(kids.map(x=>x.text),['Traits','Existing child']);assert.equal(kids[0].id,block);assert.equal(kids[0].traitsBlock,true);
  assert.equal(d.tables.bullets.find(x=>x.id==='b').text,'Atomic Habits - James Clear');
  const again=addTraitsBlock(d,'b',make);assert.equal(again.block,block,'a second #traits reuses the block');assert.equal(traitsBlocks(again.doc,'b').length,1);
});

test('the tag is removed with formatting kept aligned; code and other tags are left alone', ()=>{
  const n0=bullet('x',{parentId:null,position:0,text:'Bold #traits after',formatting:encode([{start:0,end:4,style:'BOLD'},{start:12,end:18,style:'ITALIC'}])});
  const {doc:d}=addTraitsBlock(doc([n0]),'x',make);const x=d.tables.bullets.find(b=>b.id==='x');
  assert.equal(x.text,'Bold after');assert.deepEqual(marks(x.formatting,x.text.length).map(m=>[m.style,x.text.slice(m.start,m.end)]),[['BOLD','Bold'],['ITALIC','after']]);
  assert.equal(hasTraitsTag(bullet('y',{text:'#traitsy #trait'})),false);
});

test('properties are key:: value bullets with remembered, inferred types', ()=>{
  let {doc:d,block}=addTraitsBlock(book(),'b',make);
  let r=addTraitRow(d,block,'author','text','James Clear',make,1000);d=r.doc;
  r=addTraitRow(d,block,'publishDate','number','2018',make,1100);d=r.doc;const yearRow=r.id;
  r=addTraitRow(d,block,'genres','list',['Self-help','Habits','Self-help'],make,1200);d=r.doc;
  r=addTraitRow(d,block,'finished','checkbox','yes',make,1300);d=r.doc;
  assert.deepEqual(noteTraits(d,'b').map(t=>[t.key,t.value,t.type]),[['author','James Clear','text'],['publishDate','2018','number'],['genres','Self-help, Habits','list'],['finished','true','checkbox']]);
  assert.equal(noteTrait(d,'b','AUTHOR'),'James Clear','keys match case-insensitively');
  assert.throws(()=>setTraitRow(d,yearRow,'publishDate','soon'),/number/);
  d=setTraitRow(d,yearRow,'year','2019');assert.equal(d.tables.bullets.find(x=>x.id===yearRow).text,'year:: 2019');
  assert.equal(traitKind(d,'Genres'),'list','types are per name, case-insensitive, workspace-wide');
  d=setTraitKind(d,'author','list',make,2000);assert.equal(traitKind(d,'author'),'list');
  assert.deepEqual([inferTraitKind('3.5'),inferTraitKind('2024-02-01'),inferTraitKind('2024-02-01T09:30'),inferTraitKind('TRUE'),inferTraitKind('hello')],['number','date','datetime','checkbox','text']);
  assert.equal(normaliseTraitValue('text','a\nb'),'a b');assert.throws(()=>normaliseTraitValue('date','tomorrow'),/date/);
  assert.equal(freshTraitKey(d,'b'),'property');
});

test('hand-typed rows, duplicates and ordinary bullets inside the block', ()=>{
  let {doc:d,block}=addTraitsBlock(book(),'b',make);
  d={...d,tables:{...d.tables,bullets:[...d.tables.bullets,bullet('r1',{parentId:block,position:0,text:'Rating:: 4.5'}),bullet('r2',{parentId:block,position:1,text:'just a note'}),bullet('r3',{parentId:block,position:2,text:'rating:: 3'})]}};
  assert.deepEqual(parseTraitRow('cover url::https://x.test/a.jpg'),{key:'cover url',value:'https://x.test/a.jpg'});
  assert.equal(parseTraitRow('no separator'),null);
  const t=noteTraits(d,'b');assert.deepEqual(t.map(x=>[x.key,x.duplicate]),[['Rating',false],['rating',true]]);
  assert.equal(noteTrait(d,'b','rating'),'4.5','the first value wins');
  assert.ok(insideTraits(d,'r2'));assert.ok(!insideTraits(d,'c'));
});

test('collections: columns from items, covers, known keys', ()=>{
  let d=doc([bullet('shelf',{parentId:null,position:0,text:'Books #views'}),bullet('a',{parentId:'shelf',position:0,text:'A'}),bullet('b2',{parentId:'shelf',position:1,text:'B'})]);
  for(const [id,author,cover] of [['a','X','https://img.test/a.jpg'],['b2','Y',null]]){const r=addTraitsBlock(d,id,make);d=r.doc;d=addTraitRow(d,r.block,'author','text',author,make).doc;if(cover)d=addTraitRow(d,r.block,'coverUrl','text',cover,make).doc;}
  assert.deepEqual(collectionTraitKeys(d,['a','b2']),['author','coverUrl']);
  assert.equal(traitCover(d,'a'),'https://img.test/a.jpg');assert.equal(traitCover(d,'b2'),null);
  assert.deepEqual(knownTraitKeys(d),['author','coverUrl']);
});

test('Traits blocks and property types survive a sync round trip', ()=>{
  let {doc:d,block}=addTraitsBlock(book(),'b',make);d=addTraitRow(d,block,'finished','checkbox','true',make,1000).doc;
  const root=seed(d),back=project(root).doc;root.destroy();
  assert.equal(back.tables.bullets.find(x=>x.id===block)?.traitsBlock,true);
  assert.equal(traitKind(back,'finished'),'checkbox');
  assert.deepEqual(noteTraits(back,'b').map(t=>[t.key,t.value]),[['finished','true']]);
});
