import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {bullet} from '../src/domain.mjs';
import {noteQuotes,quoteLibrary,quotePool,chooseQuote} from '../src/quotes.mjs';
import {addWidget,updateWidget,dashboard,validateDashboard} from '../src/dashboard.mjs';
import {empty,save,load,archive,parseArchive} from './.build/data.mjs';

test('standalone quote tags produce personal quotes without code, partial tags or mirrored duplicates',()=>{
 const nodes=[
  bullet('one',{text:'Stay curious. #quote\n— A reader'}),
  bullet('two',{text:'#QUOTE\nA second thought.\nA second line.',parentId:'one',kind:'QUESTION'}),
  bullet('partial',{text:'#quotes #quote-book #quote_1 #quoteÉ'}),
  bullet('empty',{text:'#quote\n— Nobody'}),
  bullet('code',{text:'code #quote',codeLanguage:'python'}),
  bullet('marked',{text:'code #quote',formatting:'5:11:CODE'}),
  bullet('linked',{text:'[[#quote|one]]'}),
  bullet('mirror',{text:'Stay curious. #quote\n— A reader',mirrorSourceId:'one'}),
  bullet('link-content',{text:'Read [[this note|one]] #quote'}),
 ];
 const before=structuredClone(nodes),quotes=noteQuotes(nodes);
 assert.deepEqual(quotes.map(q=>q.nodeId),['one','two','link-content']);
 assert.equal(quotes[0].text,'Stay curious.');assert.equal(quotes[0].author,'A reader');
 assert.equal(quotes[1].text,'A second thought.\nA second line.');assert.equal(quotes[1].author,'');
 assert.equal(quotes[2].text,'Read this note');assert.deepEqual(nodes,before,'Reading quotes does not edit notes');
 assert.equal(noteQuotes([bullet('end',{text:'Keep going. #quote! #quote'})])[0].text,'Keep going. !');
});

test('library entries carry attribution and source links; selection avoids immediate repetition',()=>{
 assert.equal(quoteLibrary.length,18);assert.equal(new Set(quoteLibrary.map(q=>q.id)).size,18);
 for(const quote of quoteLibrary){assert.ok(quote.text&&quote.author&&quote.work);assert.equal(new URL(quote.url).hostname,'www.gutenberg.org');}
 const notes=noteQuotes([bullet('one',{text:'Personal words #quote'})]);
 assert.equal(quotePool(notes,'all').length,19);assert.equal(quotePool(notes,'notes'),notes);assert.equal(quotePool(notes,'library'),quoteLibrary);
 assert.equal(chooseQuote([],undefined),null);assert.equal(chooseQuote(notes,notes[0].id),notes[0]);
 for(const random of [0,.5,.999])assert.notEqual(chooseQuote(quoteLibrary,quoteLibrary[0].id,()=>random).id,quoteLibrary[0].id);
 assert.equal(chooseQuote(quoteLibrary,undefined,()=>0),quoteLibrary[0]);
 assert.equal(chooseQuote(quoteLibrary,undefined,()=>.999),quoteLibrary.at(-1));
});

test('quote widget source settings survive normal saves and full backups',async()=>{
 let doc=addWidget(empty(),'quotes',()=> 'quotes-test');assert.equal(dashboard(doc).widgets['quotes-test'].settings.source,'all');
 doc=updateWidget(doc,'quotes-test',{settings:{source:'notes'}});validateDashboard(dashboard(doc));
 const saved=await save(null,doc,'quotes fixture');assert.equal(dashboard(await load()).widgets['quotes-test'].settings.source,'notes');
 const restored=await parseArchive(await archive(saved,new Map()));assert.deepEqual(dashboard(restored.doc),dashboard(saved));
 const invalid=structuredClone(dashboard(doc));invalid.widgets['quotes-test'].settings.source='remote';assert.throws(()=>validateDashboard(invalid),/quote source/);
});
