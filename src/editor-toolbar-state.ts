import {useEffect,useReducer} from 'react';
import type {Editor} from '@tiptap/core';
/** Text insertion with unchanged marks must not rebuild hidden formatting tools. */
export function toolbarSignature(editor:Editor){return JSON.stringify([editor.isEditable,editor.state.selection.empty,editor.state.selection.empty?null:[editor.state.selection.from,editor.state.selection.to],editor.state.storedMarks||editor.state.selection.$from.marks()]);}
export function useEditorToolbarState(editor:Editor|null,enabled=true){const[,refresh]=useReducer(n=>n+1,0);useEffect(()=>{if(!editor||!enabled)return;let previous=toolbarSignature(editor);const update=()=>{const next=toolbarSignature(editor);if(next!==previous){previous=next;refresh();}};editor.on('transaction',update);return()=>{editor.off('transaction',update);};},[editor,enabled]);}
