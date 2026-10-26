import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {act} from 'react';
import {Editor} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {getNotoEmoji} from '../src/noto-emojis.mjs';
await build({entryPoints:['src/EditorEmoji.tsx'],bundle:true,packages:'external',outfile:'tests/.build/editor-emoji.mjs',format:'esm',platform:'node',jsx:'automatic'});
const {editorEmoji}=await import('./.build/editor-emoji.mjs');
test('editing shows emoji widgets while preserving source positions, arrow navigation and whole-emoji deletion',async()=>{
 const dom=new JSDOM('<div id="editor"></div>',{pretendToBeVisual:true});for(const k of ['window','document','navigator','HTMLElement','Node','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,k,{value:k==='getComputedStyle'?dom.window[k].bind(dom.window):dom.window[k],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 const item=getNotoEmoji(':noto_1f680:'),library={emojis:new Map([[item.token,item]]),matcher:new RegExp(item.token,'g'),assets:new Map(),animate:true};let code='';let editor;
 try{
  await act(async()=>{editor=new Editor({element:document.getElementById('editor'),extensions:[StarterKit,editorEmoji(()=>library,()=>code)],content:`<p>${item.token} tail</p>`});});
  assert.equal(editor.getText(),item.token+' tail');assert.equal(document.querySelectorAll('.editor-emoji-widget').length,1);assert.equal(document.querySelector('.editor-emoji-source').textContent,item.token);
  const widget=document.querySelector('.editor-emoji-widget');
  await act(async()=>{editor.commands.setTextSelection(1);editor.view.dom.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));});assert.equal(editor.state.selection.from,1+item.token.length);assert.equal(document.querySelector('.editor-emoji-widget'),widget,'Caret movement must not restart the animation');
  await act(async()=>editor.view.dom.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Backspace',bubbles:true,cancelable:true})));assert.equal(editor.getText(),' tail');
  code='javascript';await act(async()=>editor.commands.setContent(`<p>${item.token}</p>`));assert.equal(document.querySelector('.editor-emoji-widget'),null);assert.equal(editor.getText(),item.token);
 }finally{if(editor)await act(async()=>editor.destroy());dom.window.close();}
});
