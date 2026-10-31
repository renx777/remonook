import test from'node:test';import assert from'node:assert/strict';import{JSDOM}from'jsdom';
const dom=new JSDOM('<div class="app"><button id="origin">Commands</button><div id="root"></div></div>',{url:'http://localhost',pretendToBeVisual:true});
for(const k of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLButtonElement','Node','NodeFilter','Element','MutationObserver','Event','CustomEvent'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});
globalThis.getComputedStyle=window.getComputedStyle.bind(window);globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);globalThis.cancelAnimationFrame=window.cancelAnimationFrame.bind(window);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};HTMLElement.prototype.scrollIntoView=function(){};
const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client'),{CommandPalette}=await import('./.build/CommandPalette.mjs');
const settle=()=>act(async()=>new Promise(r=>setTimeout(r,50)));
const click=async el=>{assert.ok(el);await act(async()=>el.click());await settle();};
const query=async text=>{const input=document.querySelector('[cmdk-input]');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,text);input.dispatchEvent(new window.Event('input',{bubbles:true}));});await settle();};
const key=async value=>{await act(async()=>document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true})));await settle();};
test('real cmdk searches all notes, handles duplicate titles, disabled commands, errors and keyboard dismissal',async()=>{
 const root=createRoot(document.getElementById('root'));const chosen=[],closed=[];
 const nodes=[...Array.from({length:60},(_,i)=>({id:'n'+i,text:'Ordinary note '+i,parentId:null})),{id:'a',text:'Unique late title',parentId:null},{id:'b',text:'Unique late title',parentId:'a'}];
 const render=()=>root.render(React.createElement(CommandPalette,{nodes,onChoose:id=>chosen.push(id),onClose:()=>closed.push(true),actions:[{id:'study',label:'Open Study Desk',keywords:['review'],run:()=>chosen.push('study')},{id:'disabled',label:'Unavailable action',disabled:true,run:()=>chosen.push('disabled')},{id:'fail',label:'Fail safely',run:async()=>{throw Error('Saving needs attention.');}}]}));
 try{document.getElementById('origin').focus();await act(async()=>render());await settle();assert.ok(document.activeElement.matches('[cmdk-input]'));
 await query('unique');assert.equal(document.querySelectorAll('[cmdk-item]').length,2);await key('ArrowDown');await key('Enter');assert.equal(chosen[0],'b');assert.equal(closed.length,1);
 await query('review');assert.equal(document.querySelectorAll('[cmdk-item]').length,1);await key('Enter');assert.equal(chosen.at(-1),'study');
 await query('unavailable');await key('Enter');assert.equal(chosen.includes('disabled'),false);
 await query('fail safely');await key('Enter');assert.match(document.querySelector('[role="alert"]').textContent,/Saving needs attention/);assert.equal(closed.length,2);assert.ok(document.activeElement.matches('[cmdk-input]'));
 await query('zzzznothing');assert.match(document.querySelector('.command-empty').textContent,/No matches/);await key('Escape');assert.equal(closed.length,3);
 const large=[...Array.from({length:2000},(_,i)=>({id:'bulk'+i,text:'Bulk note '+i,parentId:null})),{id:'late',text:'Latest query target',parentId:null}];
 await act(async()=>root.render(React.createElement(CommandPalette,{key:'large',nodes:large,actions:[],onChoose:id=>chosen.push(id),onClose:()=>closed.push(true)})));
 await query('bulk');await query('latest query');for(let i=0;i<50&&!document.querySelector('[cmdk-item]')?.textContent.includes('Latest query');i++)await settle();assert.equal(document.querySelectorAll('[cmdk-item]').length,1);await key('Enter');assert.equal(chosen.at(-1),'late');
 await act(async()=>root.render(null));await settle();document.getElementById('origin').focus();
 await act(async()=>root.render(React.createElement(CommandPalette,{key:'fresh-focus',nodes:[],actions:[],onChoose:()=>{},onClose:()=>root.render(null)})));await settle();await key('Escape');await settle();assert.equal(document.activeElement.id,'origin');
 }finally{await act(async()=>root.unmount());await settle();dom.window.close();}
});
