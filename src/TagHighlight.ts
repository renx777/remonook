import {Extension} from '@tiptap/core';
import {Plugin} from '@tiptap/pm/state';
import {Decoration,DecorationSet} from '@tiptap/pm/view';
import {tagColor} from './relations.mjs';
export function tagHighlight(getCode:()=>string){return Extension.create({name:'remoTags',addProseMirrorPlugins(){return [new Plugin({props:{decorations(state){if(getCode())return DecorationSet.empty;const decorations:Decoration[]=[];state.doc.descendants((node,pos)=>{if(!node.isText||node.marks.some(m=>['remoCode','code','remoMask'].includes(m.type.name)))return;for(const m of (node.text||'').matchAll(/(?:^|(?<=\s))(#[\p{L}\p{N}_-]+)/gu))decorations.push(Decoration.inline(pos+m.index!,pos+m.index!+m[0].length,{class:'editor-tag',style:`color:${tagColor(m[0])};background:${tagColor(m[0])}15;border-radius:3px`}));});return DecorationSet.create(state.doc,decorations);}}})];}});}
