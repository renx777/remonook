import {usePalettePosition} from './usePalettePosition';
import {useRef,useState} from 'react';
import type {Editor} from '@tiptap/core';
import {Icon} from './icons';
import {roughTypes} from './rough-annotations.mjs';
const colors=[['Automatic','AUTO'],['Amber','FFE082'],['Coral','F2A29B'],['Mint','A8D5BA'],['Blue','A7C7E7'],['Lilac','C5B3E6']];
export function RoughAnnotationPicker({editor,disabled}:{editor:Editor|null;disabled:boolean}){
 const details=useRef<HTMLDetailsElement>(null),panel=useRef<HTMLDivElement>(null),[open,setOpen]=useState(false),[color,setColor]=useState('AUTO');
 const unavailable=disabled||!editor||editor.isDestroyed||editor.state.selection.empty||editor.isActive('code');
 usePalettePosition(open, details, panel);
 const apply=(type?:string)=>{if(unavailable||!editor)return;if(type)editor.chain().focus().toggleMark('remoRough',{type,color}).run();else editor.chain().focus().unsetMark('remoRough').run();if(details.current)details.current.open=false;};
 return <details ref={details} className="format-palette rough-annotation-picker" onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary className="selection-tool" aria-label="Sketch annotations" aria-disabled={unavailable} title="Sketch annotations · select text first" onClick={event=>{if(unavailable)event.preventDefault();}}><Icon name="sketch" size={18}/></summary>
  {open&&<div ref={panel} className="palette-popover" onMouseDown={event=>event.preventDefault()}>
   <div className="palette-panel-heading"><strong>Sketch annotations</strong><span>Selected text</span></div>
   <div className="rough-colors" role="group" aria-label="Annotation color">{colors.map(([name,value])=><button key={value} type="button" aria-label={`${name} annotation`} aria-pressed={color===value} title={name} style={{background:value==='AUTO'?'var(--soft)':'#'+value,color:value==='AUTO'?'var(--text)':'#18181b'}} onClick={()=>setColor(value)}>{value==='AUTO'?'A':color===value?'✓':''}</button>)}</div>
   <div className="rough-style-options" role="group" aria-label="Annotation style">{roughTypes.map(([type,label])=><button type="button" key={type} disabled={unavailable} aria-label={`Sketch ${type}`} aria-pressed={editor?.isActive('remoRough',{type,color})||false} onClick={()=>apply(type)}>{label}</button>)}</div>
   <div className="palette-panel-footer"><button type="button" disabled={unavailable} onClick={()=>apply()}>Remove annotation</button></div>
  </div>}
 </details>;
}
