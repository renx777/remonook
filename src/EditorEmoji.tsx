import React from 'react';
import {createRoot} from 'react-dom/client';
import {Extension} from '@tiptap/core';
import {Plugin,TextSelection} from '@tiptap/pm/state';
import {Decoration,DecorationSet} from '@tiptap/pm/view';
import {AnimatedEmoji,EmojiProvider,useEmojiLibrary} from './AnimatedEmoji';
type Library=ReturnType<typeof useEmojiLibrary>;
export function editorEmoji(getLibrary:()=>Library,getCode:()=>string){return Extension.create({name:'remoInlineEmoji',addProseMirrorPlugins(){return [new Plugin({props:{decorations(state){
 if(getCode())return DecorationSet.empty;
 const library=getLibrary(),decorations:Decoration[]=[];
 state.doc.descendants((node,pos)=>{if(!node.isText||node.marks.some(m=>['remoCode','code','remoMask'].includes(m.type.name))||!library.matcher)return;
 for(const match of (node.text||'').matchAll(new RegExp(library.matcher.source,'g'))){const item=library.emojis.get(match[0]);if(!item)continue;const from=pos+match.index!,to=from+match[0].length;
 decorations.push(Decoration.inline(from,to,{class:'editor-emoji-source'}));
 decorations.push(Decoration.widget(from,view=>{const host=document.createElement('span');host.className='editor-emoji-widget';host.contentEditable='false';const root=createRoot(host);queueMicrotask(()=>{if(host.isConnected)root.render(<EmojiProvider emojis={[...library.emojis.values()]} assets={library.assets} animate={library.animate}><AnimatedEmoji item={item} blob={library.assets.get('emoji/'+item.fileName)}/></EmojiProvider>);});host.onmousedown=e=>{e.preventDefault();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,to)));view.focus();};(host as any).dispose=()=>queueMicrotask(()=>root.unmount());return host;},{side:-1,ignoreSelection:true,destroy:node=>(node as any).dispose?.()}));
 }});return DecorationSet.create(state.doc,decorations);
 },handleKeyDown(view,event){if(getCode()||!view.state.selection.empty||event.shiftKey||event.ctrlKey||event.metaKey||event.altKey)return false;const {from}=view.state.selection;let range:{from:number;to:number}|undefined;const matcher=getLibrary().matcher;if(!matcher)return false;
 view.state.doc.descendants((node,pos)=>{if(!node.isText||node.marks.some(m=>['remoCode','code','remoMask'].includes(m.type.name)))return;for(const m of (node.text||'').matchAll(new RegExp(matcher.source,'g'))){const start=pos+m.index!,end=start+m[0].length;if((['Backspace','ArrowLeft'].includes(event.key)&&from>start&&from<=end)||(['Delete','ArrowRight'].includes(event.key)&&from>=start&&from<end))range={from:start,to:end};}});
 if(!range)return false;const r=range as {from:number;to:number};event.preventDefault();view.dispatch(['Backspace','Delete'].includes(event.key)?view.state.tr.delete(r.from,r.to):view.state.tr.setSelection(TextSelection.create(view.state.doc,event.key==='ArrowLeft'?r.from:r.to)));return true;
 }}})];}});}
