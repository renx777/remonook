import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import { act } from 'react';
import { empty, withNodes, save, load, getAssets } from './.build/data.mjs';
import { bullet } from '../src/domain.mjs';
import { configureMcq } from '../src/mcq.mjs';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Node', 'DOMParser', 'MutationObserver', 'getComputedStyle']) Object.defineProperty(globalThis, key, { value: key === 'getComputedStyle' ? dom.window.getComputedStyle.bind(dom.window) : dom.window[key], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = undefined;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window); globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
HTMLElement.prototype.scrollTo = function ({ top = 0 }) { this.scrollTop = top; };
dom.window.Range.prototype.getClientRects = () => [];
dom.window.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
const wait = async check => { for (let i = 0; i < 150; i++) { if (check()) return; await act(async () => new Promise(resolve => setTimeout(resolve, 20))); } throw Error('Timed out waiting for inline emoji UI'); };
const key = async value => act(async () => document.querySelector('.tiptap').dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })));

test('edit flashcards and MCQs in study without changing position or schedules; Cancel leaves notes intact',async()=>{
 const nodes=[bullet('qa',{text:'First question',kind:'QUESTION',formatting:'0:5:BOLD'}),bullet('a',{parentId:'qa',text:'First answer',formatting:'0:5:ITALIC'}),bullet('mcq',{position:1,text:'Choose a number',kind:'QUESTION'}),...['One @Answer','Two','Three','Four'].map((text,i)=>bullet('o'+i,{parentId:'mcq',position:i,text}))];
 let doc=withNodes(empty(),nodes);doc=configureMcq(doc,'mcq',{correctOptionId:'o0',explanation:'Initial reason',shuffle:false});doc=withNodes(doc,doc.tables.bullets);
 const schedule=structuredClone(doc.tables.cards);await save(null,doc);let app;
 const clickText=async text=>act(async()=>{const el=[...document.querySelectorAll('button')].find(el=>el.textContent.trim().startsWith(text));assert.ok(el,text);el.click();});
 const edit=async()=>{await clickText('Edit card');await wait(()=>document.querySelector('.study-card-editor .tiptap'));};
 const append=async text=>act(async()=>{const editor=document.querySelector('.study-card-editor .tiptap').editor;editor.commands.focus('end');editor.commands.insertContent(text);});
 try{
  await act(async()=>{app=await import('./.build/app.mjs');});await wait(()=>document.querySelector('.outline-row'));
  await clickText('Study Desk');await clickText('Cram');await act(async()=>document.querySelector('[aria-label="Open All flashcards notebook"]').click());
  const queue=document.querySelector('.study-progress-label').textContent;
  await edit();await append(' cancelled');await clickText('Cancel');assert.equal(document.querySelector('.flashcard-question').textContent,'First question');
  await edit();await append(' revised');await act(async()=>document.querySelector('[data-node-id="a"] .study-edit-preview').click());await append(' revised');
  await clickText('Save changes');assert.equal(document.querySelector('.flashcard-question').textContent,'First question revised');assert.equal(document.querySelector('.study-progress-label').textContent,queue);
  assert.equal(document.querySelector('dialog.study-card-editor'),null,'Editor is embedded in the card');
  await clickText('Add bullet');await wait(()=>document.querySelector('.study-card-editor .tiptap'));await append('Extra detail');await clickText('Save changes');
  await clickText('Show answer');assert.match(document.querySelector('.flashcard-answer').textContent,/First answer revised/);
  await clickText('Show full bullets');assert.match(document.querySelector('.flashcard-answer').textContent,/Extra detail/);
  await clickText('Next card');assert.ok(document.querySelector('.study-finished'), 'All flashcards ends before the MCQ');
  await clickText('Back to Study Desk');await act(async()=>document.querySelector('[aria-label="Open All MCQs notebook"]').click());await wait(()=>document.querySelector('.mcq-options'));
  await act(async()=>document.querySelectorAll('.mcq-option')[1].click());assert.match(document.querySelector('.mcq-feedback').textContent,/Not quite/);
  await edit();await append(' revised');await act(async()=>document.querySelector('[data-node-id="o2"] .study-edit-preview').click());await append(' revised');
  await act(async()=>document.querySelector('[aria-label="Correct option 3"]').click());
  await act(async()=>{const textarea=document.querySelector('[aria-label="MCQ explanation"]');const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;set.call(textarea,'Updated reason');textarea.dispatchEvent(new window.Event('input',{bubbles:true}));});
  await clickText('Save changes');assert.equal(document.querySelector('.mcq-feedback'),null,'Edited MCQs require a new attempt');assert.match(document.querySelector('.flashcard-question').textContent,/Choose a number revised/);
  assert.match(document.querySelector('.study-progress-label').textContent,/1 \/ 1/);
  await act(async()=>document.querySelectorAll('.mcq-option')[2].click());assert.match(document.querySelector('.mcq-feedback').textContent,/Correct!/);assert.match(document.querySelector('.mcq-feedback').textContent,/Updated reason/);
  await act(async()=>new Promise(resolve=>setTimeout(resolve,300)));const stored=await load();
  assert.equal(stored.tables.bullets.find(n=>n.id==='qa').formatting,'0:5:BOLD');assert.equal(stored.tables.bullets.find(n=>n.id==='a').formatting,'0:5:ITALIC');
  assert.equal(stored.web.mcqs.mcq.correctOptionId,'o2');assert.match(stored.tables.bullets.find(n=>n.id==='o2').text,/@Answer/);assert.doesNotMatch(stored.tables.bullets.find(n=>n.id==='o0').text,/@Answer/);
  for(const before of schedule){const after=stored.tables.cards.find(c=>c.id===before.id);assert.equal(after.dueAtEpochMillis,before.dueAtEpochMillis);assert.equal(after.repetitionCount,before.repetitionCount);}
 }finally{if(app)await act(async()=>app.appRoot.unmount());dom.window.close();}
});
