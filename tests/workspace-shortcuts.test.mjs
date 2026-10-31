import test from 'node:test';import assert from 'node:assert/strict';import{JSDOM}from'jsdom';
const dom=new JSDOM('<input id="input"><div contenteditable="true" id="editor"></div><dialog open><input id="modal"></dialog><div role="dialog" data-command-palette><input id="palette"></div><div class="study-session is-immersive"><button id="study">Review</button></div>',{pretendToBeVisual:true});
for(const k of ['window','document','navigator','HTMLElement'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});
const{bindWorkspaceShortcuts}=await import('./.build/workspace-shortcuts.mjs');
test('Tinykeys handles app commands once, respects modal/editor ownership, composition and cleanup',()=>{
 const calls=[];const off=bindWorkspaceShortcuts(window,Object.fromEntries(['command','save','sidebar','pane'].map(id=>[id,()=>calls.push(id)])));
 const key=(id,key,options={})=>document.getElementById(id).dispatchEvent(new window.KeyboardEvent('keydown',{key,code:'Key'+key.toUpperCase(),ctrlKey:true,bubbles:true,cancelable:true,...options}));
 key('editor','k');key('input','s');key('input','\\',{code:'Backslash'});key('editor','r',{ctrlKey:false,altKey:true});assert.deepEqual(calls,['command','save','sidebar','pane']);
 key('modal','k');key('modal','s');key('study','k');assert.equal(calls.length,4);key('study','s');assert.equal(calls.at(-1),'save');
 key('palette','k');assert.equal(calls.at(-1),'command');const count=calls.length;
 key('input','k',{isComposing:true});key('input','k',{repeat:true});key('input','k',{shiftKey:true});assert.equal(calls.length,count);
 document.body.classList.add('driver-active');key('input','k');assert.equal(calls.length,count);document.body.classList.remove('driver-active');
 const reader=document.createElement('dialog');reader.className='book-reader';reader.setAttribute('open','');document.body.append(reader);key('input','k');assert.equal(calls.length,count);reader.remove();
 off();key('input','k');assert.equal(calls.length,count);dom.window.close();
});
