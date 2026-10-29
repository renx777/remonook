import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {JSDOM} from 'jsdom';import {Editor} from '@tiptap/core';import StarterKit from '@tiptap/starter-kit';import hljs from 'highlight.js/lib/common';
await build({entryPoints:['src/CodeBlock.tsx'],bundle:true,packages:'external',outfile:'tests/.build/code-block.mjs',format:'esm',platform:'node',jsx:'automatic'});
const {codeHighlight}=await import('./.build/code-block.mjs');
test('caret movement reuses syntax decorations while text and language changes refresh them',()=>{
 const dom=new JSDOM('<div id="editor"></div>',{pretendToBeVisual:true});for(const key of ['window','document','navigator','HTMLElement','Node','MutationObserver','getComputedStyle'])Object.defineProperty(globalThis,key,{value:key==='getComputedStyle'?dom.window[key].bind(dom.window):dom.window[key],configurable:true});
 const original=hljs.highlight;let calls=0,language='javascript',editor;hljs.highlight=(...args)=>{calls++;return original(...args);};
 try{
  editor=new Editor({element:document.querySelector('#editor'),extensions:[StarterKit,codeHighlight(()=>language)],content:'<p>const value = 1;</p>'});const initial=calls;assert.ok(initial>0);
  for(const at of [2,3,6,10])editor.commands.setTextSelection(at);assert.equal(calls,initial,'moving a caret must not repeatedly parse unchanged code');
  editor.commands.insertContent('x');assert.ok(calls>initial);const edited=calls;language='python';editor.view.dispatch(editor.state.tr);assert.ok(calls>edited);assert.match(editor.getText(),/x/);
 }finally{hljs.highlight=original;editor?.destroy();dom.window.close();}
});
