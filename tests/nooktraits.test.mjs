import test from 'node:test';import assert from 'node:assert/strict';
import {empty} from './.build/data.mjs';import {bullet,encode} from '../src/domain.mjs';
import {traitsActive,traitType,traitFields,traitValue,applyTraitType,activateTraits,attachTraitField,setTraitValues,setTraitsBulk,traitView,updateTraitView,queryTraits,traitSearchText,allTraitDefinitions} from '../src/nooktraits.mjs';
import {createProperty,setPropertyValues,propertyHistory,renameProperty} from '../src/note-properties.mjs';
import {searchMatcher} from '../src/search.mjs';
import {saveNoteTemplate,instantiateNoteTemplate} from '../src/note-templates.mjs';
import {seed,sharedState,openShared,applyIntent,project,Y} from '../src/sync-crdt.mjs';
function fixture(){const d=empty();return {...d,tables:{...d.tables,bullets:[bullet('library',{text:'My reading list #nooktraits'}),bullet('a',{text:'Atomic Habits #nooktraits/book'}),bullet('b',{text:'Deep Work #nooktraits/book',position:1}),bullet('p',{text:'Launch #nooktraits/project',position:2}),bullet('plain',{text:'An ordinary note',position:3})]}};}
const setText=(d,id,text)=>({...d,tables:{...d.tables,bullets:d.tables.bullets.map(n=>n.id===id?{...n,text}:n)}});
const option=(d,field,label)=>Object.entries(allTraitDefinitions(d).find(f=>f.id===field).options).find(([,v])=>v===label)[0];
test('activation is explicit, ignores topic tags, code and linked labels, and resolves mirrors',()=>{
 const d=fixture();assert.equal(traitsActive(d,'a'),true);assert.equal(traitType(d,'a'),'book');assert.equal(traitsActive(d,'plain'),false);
 for(const text of ['#book','#nooktraitsish','https://example.com/#nooktraits','[[#nooktraits|a]]'])assert.equal(traitsActive(setText(d,'plain',text),'plain'),false,text);
 const code=setText(d,'plain','#nooktraits');code.tables.bullets=code.tables.bullets.map(n=>n.id==='plain'?{...n,formatting:encode([{start:0,end:11,style:'CODE'}])}:n);assert.equal(traitsActive(code,'plain'),false);
 const mirrored={...d,tables:{...d.tables,bullets:[...d.tables.bullets,bullet('mirror',{mirrorSourceId:'a'})]}};assert.equal(traitsActive(mirrored,'mirror'),true);
 assert.throws(()=>setTraitValues(d,'plain',{}),/deactivated/);
});
test('types create relevant fields and stable choices; preserve ordinary bullet and existing values',()=>{
 let d=fixture();d=applyTraitType(d,'a','book');d=applyTraitType(d,'p','project');
 assert.ok(traitFields(d,'a').some(f=>f.id==='nook-book-author'));assert.ok(!traitFields(d,'a').some(f=>f.id==='nook-project-priority'));
 assert.equal(traitValue(d,'a','nook-book-status'),option(d,'nook-book-status','To read'));assert.equal(d.tables.bullets.find(n=>n.id==='a').kind,'NOTE');
 d=setTraitValues(d,'a',{'nook-book-status':null,'nook-book-rating':0});d=applyTraitType(d,'a','book');assert.equal(traitValue(d,'a','nook-book-status'),null);assert.equal(traitValue(d,'a','nook-book-rating'),0);
 const old=d;d=setText(d,'a','Atomic Habits');assert.equal(traitsActive(d,'a'),false);assert.equal(traitValue(d,'a','nook-book-rating'),0);d=activateTraits(d,'a');assert.equal(traitType(d,'a'),'book');assert.deepEqual(d.web.noteProperties,old.web.noteProperties);
});
test('legacy values return on activation, note-local field removal and type sharing retain data',()=>{
 let d=fixture();const p=createProperty(d,{name:'Personal score',type:'number'});d=setPropertyValues(p.doc,'plain',{[p.id]:0});d=activateTraits(d,'plain');assert.ok(traitFields(d,'plain').some(f=>f.id===p.id));
 d=attachTraitField(d,'plain',p.id,false);assert.ok(!traitFields(d,'plain').some(f=>f.id===p.id));assert.equal(traitValue(d,'plain',p.id),0);
 d=applyTraitType(d,'a','book');d=applyTraitType(d,'b','book');d=attachTraitField(d,'a',p.id,true,true);assert.ok(traitFields(d,'b').some(f=>f.id===p.id));
});
test('due and completion adapters edit canonical fields; searches include useful values and labels',()=>{
 let d=applyTraitType(fixture(),'p','project');d=setTraitValues(d,'p',{'@due':'2026-12-01','@done':false});let p=d.tables.bullets.find(n=>n.id==='p');assert.equal(p.dueDate,'2026-12-01');assert.equal(p.taskState,'TODO');assert.equal(traitValue(d,'p','@done'),false);assert.ok(!d.web.noteProperties?.values?.p?.['@due']);
 d=setTraitValues(d,'p',{'@done':true});assert.equal(d.tables.bullets.find(n=>n.id==='p').taskState,'DONE');assert.match(traitSearchText(d,'p'),/project/);assert.throws(()=>setTraitValues(d,'p',{'@updated':'2026-12-01T00:00:00.000Z'}),/valid/);
});
test('named collection queries filter/sort typed values without changing outline positions; bulk is atomic',()=>{
 let d=applyTraitType(applyTraitType(fixture(),'a','book'),'b','book');d=setTraitValues(d,'a',{'nook-book-status':option(d,'nook-book-status','Reading'),'nook-book-rating':0});d=setTraitValues(d,'b',{'nook-book-rating':5});
 d=updateTraitView(d,'library','all',{source:'workspace',type:'book',sortField:'nook-book-rating',direction:'desc'});const config=traitView(d,'library'),positions=d.tables.bullets.map(n=>[n.id,n.parentId,n.position]);
 assert.deepEqual(queryTraits(d,'library',config).map(n=>n.id),['b','a']);assert.deepEqual(queryTraits(d,'library',config,'reading').map(n=>n.id),['a']);assert.deepEqual(queryTraits(d,'library',{...config,filterField:'nook-book-rating',operator:'filled',filterValue:''}).map(n=>n.id),['b','a']);
 assert.deepEqual(queryTraits(d,'library',{...config,filterField:'nook-book-rating',operator:'equals',filterValue:'0'}).map(n=>n.id),['a']);
 const done=option(d,'nook-book-status','Finished');const made=setTraitsBulk(d,['a','b'],'nook-book-status',done);assert.equal(queryTraits(made,'library',config,'finished').length,2);assert.deepEqual(made.tables.bullets.map(n=>[n.id,n.parentId,n.position]),positions);
 assert.throws(()=>setTraitsBulk(d,['a','plain'],'nook-book-status',done),/activated/);assert.equal(queryTraits(d,'library',config,'finished').length,0);
});
test('two offline clients create identical starter IDs and merge both edits and field attachments',()=>{
 const base=fixture(),root=seed(base),state=sharedState(root),a=openShared(state),b=openShared(state);
 try{let x=applyTraitType(base,'a','book'),y=applyTraitType(base,'a','book');assert.deepEqual(allTraitDefinitions(x).find(f=>f.id==='nook-book-status').options,allTraitDefinitions(y).find(f=>f.id==='nook-book-status').options);x=setTraitValues(x,'a',{'nook-book-author':'From phone'});y=setTraitValues(y,'a',{'nook-book-author':'From laptop'});applyIntent(a,base,x);applyIntent(b,base,y);Y.applyUpdate(a,Y.encodeStateAsUpdate(b));Y.applyUpdate(b,Y.encodeStateAsUpdate(a));const da=project(a).doc,db=project(b).doc;assert.equal(traitValue(da,'a','nook-book-author'),traitValue(db,'a','nook-book-author'));assert.deepEqual(new Set(propertyHistory(da,'a','nook-book-author').map(e=>e.value)),new Set(['From phone','From laptop']));}finally{root.destroy();a.destroy();b.destroy();}
});
test('templates preserve activation, chosen type, attached fields, explicit clears and independent note IDs',()=>{
 let d=applyTraitType(fixture(),'a','book');d=setTraitValues(d,'a',{'nook-book-status':null,'nook-book-author':'An author'});const saved=saveNoteTemplate(d,'a','Book notes');const made=instantiateNoteTemplate(saved.doc,saved.id);assert.ok(traitsActive(made.doc,made.id));assert.equal(traitType(made.doc,made.id),'book');assert.equal(traitValue(made.doc,made.id,'nook-book-status'),null);assert.equal(traitValue(made.doc,made.id,'nook-book-author'),'An author');assert.notEqual(made.id,'a');
});
test('compatible legacy fields are reused instead of creating a second Author value',()=>{let d=fixture();const old=createProperty(d,{name:'Author',type:'text'});d=setPropertyValues(old.doc,'a',{[old.id]:'Existing author'});d=applyTraitType(d,'a','book');assert.equal(traitValue(d,'a','nook-book-author'),'Existing author');assert.equal(traitFields(d,'a').filter(f=>f.name==='Author').length,1);d=setTraitValues(d,'a',{'nook-book-author':'Edited author'});assert.equal(traitValue(d,'a',old.id),'Edited author');assert.equal(d.web.noteProperties.values.a['nook-book-author'],undefined);});

test('removing a reused starter hides its alias; sharing it reuses one definition on other books',()=>{let d=fixture();const old=createProperty(d,{name:'Author',type:'text'});d=applyTraitType(setPropertyValues(old.doc,'a',{[old.id]:'Original author'}),'a','book');d=attachTraitField(d,'a',old.id,true,true);assert.equal(traitFields(d,'b').filter(f=>f.name==='Author').length,1);assert.equal(traitFields(d,'b').find(f=>f.name==='Author').id,old.id);d=attachTraitField(d,'a',old.id,false);assert.equal(traitFields(d,'a').some(f=>f.name==='Author'),false);assert.equal(traitValue(d,'a',old.id),'Original author');});
test('changing types retains prior values; URL, timestamp and rating validation are strict',()=>{let d=applyTraitType(fixture(),'a','book');d=setTraitValues(d,'a',{'nook-book-author':'Ada'});d=applyTraitType(d,'a','movie');assert.equal(traitFields(d,'a').some(f=>f.id==='nook-book-author'),false);assert.equal(traitValue(d,'a','nook-book-author'),'Ada');assert.throws(()=>setTraitValues(d,'a',{'nook-movie-rating':6}),/valid/);d=applyTraitType(d,'a','person');assert.throws(()=>setTraitValues(d,'a',{'nook-person-website':'javascript:alert(1)'}),/valid/);d=setTraitValues(d,'a',{'nook-person-website':'https://example.com'});assert.equal(traitValue(d,'a','nook-person-website'),'https://example.com');});

test('ordinary and trait searches find values and respect AND/OR and exclusion',()=>{let d=applyTraitType(fixture(),'a','book');d=setTraitValues(d,'a',{'nook-book-author':'James Clear'});const matches=searchMatcher(d.tables.bullets,[],{},Date.now(),n=>traitSearchText(d,n.id)),n=d.tables.bullets.find(n=>n.id==='a');assert.equal(matches(n,'James'),true);assert.equal(matches(n,'trait:Clear'),true);assert.equal(matches(n,'Atomic AND Clear'),true);assert.equal(matches(n,'Atomic -Clear'),false);assert.equal(matches(n,'trait:Unknown OR Clear'),true);});

test('tagged imported books participate in To read before their first editor mount; explicit clear stays empty',()=>{let d=fixture();const config={...traitView(d,'library'),source:'workspace',type:'book'};assert.equal(queryTraits(d,'library',config,'toRead').length,2);d=setTraitValues(d,'a',{'nook-book-status':null});assert.deepEqual(queryTraits(d,'library',config,'toRead').map(n=>n.id),['b']);});

test('archiving a starter field does not break activation of subsequent notes',()=>{let d=applyTraitType(fixture(),'a','book');d=renameProperty(d,'nook-book-status','Reading status',true);d=applyTraitType(d,'b','book');assert.equal(traitFields(d,'b').some(f=>f.id==='nook-book-status'),false);assert.equal(traitValue(d,'b','nook-book-status'),null);assert.equal(propertyHistory(d,'a','nook-book-status').length,1);});

test('type selection leaves an inline-code shortcut untouched',()=>{let d=setText(fixture(),'plain','#nooktraits #nooktraits/book');d={...d,tables:{...d.tables,bullets:d.tables.bullets.map(n=>n.id==='plain'?{...n,formatting:encode([{start:12,end:n.text.length,style:'CODE'}])}:n)}};const next=applyTraitType(d,'plain','project');assert.equal(next.tables.bullets.find(n=>n.id==='plain').text,'#nooktraits #nooktraits/book');assert.equal(traitType(next,'plain'),'project');});
