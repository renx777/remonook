import test from 'node:test';import assert from 'node:assert/strict';import{JSDOM}from'jsdom';import React,{act}from'react';
const dom=new JSDOM('<div class="app" data-theme="Dark"><div id="root"></div></div>',{url:'https://app.test',pretendToBeVisual:true});
for(const key of ['window','document','navigator','HTMLElement','MutationObserver','MessageEvent','localStorage'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const{createRoot}=await import('react-dom/client'),{SocialPost}=await import('./.build/SocialPost.mjs'),{SocialBookmarkReader}=await import('./.build/SocialBookmarkReader.mjs');
const click=async label=>act(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===label||b.textContent===label);assert(button,label);button.click();});
test('post frames isolate providers, follow theme, hide offline and accept resize only from their own window/origin',async()=>{
 const root=createRoot(document.getElementById('root'));
 try{
  await act(()=>root.render(React.createElement(SocialPost,{url:'https://x.com/jack/status/20'})));
  const frame=document.querySelector('iframe');assert(frame.src.includes('theme=dark'));assert.equal(frame.getAttribute('referrerpolicy'),'no-referrer');assert.equal(frame.getAttribute('srcdoc'),null);assert(!frame.getAttribute('sandbox').includes('allow-top-navigation'));
  const data={'twttr.embed':{method:'twttr.private.resize',params:[{height:333}]}};
  await act(()=>window.dispatchEvent(new MessageEvent('message',{data,origin:'https://evil.test',source:frame.contentWindow})));assert.equal(frame.height,'520');
  await act(()=>window.dispatchEvent(new MessageEvent('message',{data,origin:'https://platform.twitter.com',source:window})));assert.equal(frame.height,'520');
  await act(()=>window.dispatchEvent(new MessageEvent('message',{data,origin:'https://platform.twitter.com',source:frame.contentWindow})));assert.equal(frame.height,'333');
  await click('Hide X preview');assert.equal(document.querySelector('iframe'),null);assert(document.querySelector('a[href="https://x.com/i/web/status/20"]'));
  await click('Show X preview');assert(document.querySelector('iframe'));
  Object.defineProperty(navigator,'onLine',{value:false,configurable:true});await act(()=>window.dispatchEvent(new window.Event('offline')));assert.equal(document.querySelector('iframe'),null);assert.match(document.body.textContent,/saved link and notes are available/);
  Object.defineProperty(navigator,'onLine',{value:true,configurable:true});await act(()=>window.dispatchEvent(new window.Event('online')));assert(document.querySelector('iframe'));
  await act(()=>document.querySelector('.app').setAttribute('data-theme','Light'));assert(!document.querySelector('iframe').src.includes('theme=dark'));
 }finally{await act(()=>root.unmount());}
});
test('social bookmark notes use source-linked mutations and render supplied text literally',async()=>{
 const{bookmarkNote}=await import('../src/bookmarks.mjs');const root=createRoot(document.getElementById('root'));let doc={web:{bookmarks:{p:{id:'p',url:'https://instagram.com/p/ABC_123/',title:'Instagram post'}}},tables:{bullets:[],trash:[]}},opened,savedCopy=false;
 function Harness(){const[d,setDoc]=React.useState(doc);return React.createElement(SocialBookmarkReader,{doc:d,bookmark:d.web.bookmarks.p,disabled:false,onBack(){},onNotes:id=>{opened=id;},onSavedCopy:()=>{savedCopy=true;},onSave:async(text,id)=>{doc=bookmarkNote(doc,doc.web.bookmarks.p,text,id);setDoc(doc);}});}
 try{
  await act(()=>root.render(React.createElement(Harness)));
  const area=document.querySelector('textarea'),text='My thought\n<script>preserve as text</script>';
  await act(()=>{Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(area,text);area.dispatchEvent(new window.Event('input',{bubbles:true}));});
  await act(()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  const saved=doc.tables.bullets.find(n=>n.text===text);assert(saved);assert.equal(doc.web.bookmarkSources[saved.id].url,'https://instagram.com/p/ABC_123/');assert.equal(document.querySelector('.social-reader-notes script'),null);
  await click('Open in outline');assert.equal(opened,saved.id);await click('Saved article');assert(savedCopy);assert.equal(area.value,'');
 }finally{await act(()=>root.unmount());}
});
test('failed and repeated submissions preserve the same local draft and retry identity',async()=>{
 let calls=0,resolve,seen=[];const props={doc:{web:{},tables:{bullets:[]}},bookmark:{id:'retry',url:'https://x.com/jack/status/20'},disabled:false,onBack(){},onNotes(){},onSave:async(text,id)=>{calls++;seen.push(id);await new Promise(r=>{resolve=r;});if(calls===1)throw Object.assign(Error('Storage unavailable'),{captureApplied:true});}};
 let root=createRoot(document.getElementById('root'));
 await act(()=>root.render(React.createElement(SocialBookmarkReader,props)));
 const area=document.querySelector('textarea');await act(()=>{Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(area,'Keep this draft');area.dispatchEvent(new window.Event('input',{bubbles:true}));});
 await act(()=>{for(let i=0;i<2;i++)document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));});assert.equal(calls,1);
 await act(()=>resolve());assert.equal(document.querySelector('textarea').value,'Keep this draft');assert(document.querySelector('textarea').disabled);
 await act(()=>root.unmount());root=createRoot(document.getElementById('root'));await act(()=>root.render(React.createElement(SocialBookmarkReader,props)));assert.equal(document.querySelector('textarea').value,'Keep this draft');
 await act(()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));await act(()=>resolve());assert.equal(seen[0],seen[1]);assert.equal(document.querySelector('textarea').value,'');await act(()=>root.unmount());
});
test.after(()=>dom.window.close());
