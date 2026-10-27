import {useEffect,useReducer,useState} from 'react';
import type {Editor} from '@tiptap/core';
import {Icon} from './icons';
import {FormattingPalette} from './FormattingPalette';
import {RoughAnnotationPicker} from './RoughAnnotationPicker';
import {textColors} from './color-palettes';

export function MobileEditToolbar({editor,disabled,formattingDisabled,blockStyle,dividerStyle,dividerColor,onCommand,onDone}:{editor:Editor|null;disabled:boolean;formattingDisabled:boolean;blockStyle:string;dividerStyle?:string;dividerColor?:string;onCommand:(action:string)=>void;onDone:()=>void}){
 const [mobile,setMobile]=useState(()=>window.matchMedia('(max-width: 760px)').matches);
 const [inset,setInset]=useState(0);
 const [,refresh]=useReducer(n=>n+1,0);
 useEffect(()=>{const media=window.matchMedia('(max-width: 760px)'),update=()=>setMobile(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 useEffect(()=>{if(!editor)return;const update=()=>refresh();editor.on('transaction',update);return()=>{editor.off('transaction',update);};},[editor]);
 useEffect(()=>{
  if(!mobile)return;
  const viewport=window.visualViewport;
  const update=()=>{setInset(viewport?Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop):0);};
  update();viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);window.addEventListener('resize',update);
  return()=>{viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);window.removeEventListener('resize',update);};
 },[mobile]);
 if(!mobile||!editor||editor.isDestroyed)return null;
 const formatDisabled=disabled||formattingDisabled;
 return <div className="mobile-edit-dock" data-keyboard={inset>80} style={{bottom:inset}}>
  <div className="mobile-edit-scroll" role="toolbar" aria-label="Mobile editing tools" onMouseDown={e=>{if(!(e.target instanceof HTMLElement&&e.target.closest('select,input,option')))e.preventDefault();}}>
   <button type="button" aria-label="Outdent bullet" title="Outdent" disabled={disabled} onClick={()=>{onCommand('outdent');editor.commands.focus();}}><Icon name="outdent" size={20}/></button>
   <button type="button" aria-label="Indent bullet" title="Indent" disabled={disabled} onClick={()=>{onCommand('indent');editor.commands.focus();}}><Icon name="indent" size={20}/></button>
   <span className="mobile-tool-divider"/>
   {(['bold','italic','underline','strike'] as const).map((mark,i)=><button key={mark} type="button" aria-label={['Bold','Italic','Underline','Strikethrough'][i]} aria-pressed={editor.isActive(mark)} disabled={formatDisabled} onClick={()=>editor.chain().focus().toggleMark(mark).run()}><Icon name={mark} size={20}/></button>)}
   <FormattingPalette allowCaret editor={editor} disabled={formatDisabled}/><FormattingPalette allowCaret editor={editor} disabled={formatDisabled} mode="highlight"/><RoughAnnotationPicker editor={editor} disabled={formatDisabled}/>
   <span className="mobile-tool-divider"/>
   <select aria-label="Mobile text style" value={['h1','h2','h3','quote','divider'].includes(blockStyle)?blockStyle:'paragraph'} disabled={formatDisabled} onChange={e=>{onCommand('block:'+e.target.value);editor.commands.focus();}}><option value="paragraph">Text</option><option value="h1">H1</option><option value="h2">H2</option><option value="h3">H3</option><option value="quote">Quote</option><option value="divider">Divider</option></select>
   {blockStyle==='divider'&&<><select aria-label="Mobile divider style" value={dividerStyle||'straight'} onChange={e=>{onCommand('dividerStyle:'+e.target.value);editor.commands.focus();}}><option value="straight">Straight</option><option value="squiggly">Squiggly</option><option value="dotted">Dotted</option></select><select aria-label="Mobile divider color" value={dividerColor||''} onChange={e=>{onCommand('dividerColor:'+e.target.value);editor.commands.focus();}}><option value="">Default color</option>{textColors.map(([name,hex])=><option key={hex} value={'#'+hex}>{name}</option>)}</select></>}
   <button type="button" aria-label="Numbered list" disabled={formatDisabled} onClick={()=>{onCommand('block:numbered');editor.commands.focus();}}><Icon name="numbered" size={19}/></button>
   <button type="button" aria-label="Task bullet" disabled={disabled} onClick={()=>{onCommand('block:task');editor.commands.focus();}}><Icon name="check" size={19}/></button>
   <button type="button" aria-label="Mask text" aria-pressed={editor.isActive('remoMask')} disabled={formatDisabled} onClick={()=>editor.chain().focus().toggleMark('remoMask').run()}><Icon name="mask" size={19}/></button>
   <button type="button" aria-label="Inline code" aria-pressed={editor.isActive('code')} disabled={formatDisabled} onClick={()=>editor.chain().focus().toggleMark('code').run()}><Icon name="code" size={19}/></button>
   <button type="button" aria-label="Undo edit" disabled={disabled} onClick={()=>onCommand('undo')}><Icon name="undo" size={19}/></button>
   <button type="button" aria-label="Redo edit" disabled={disabled} onClick={()=>onCommand('redo')}><Icon name="redo" size={19}/></button>
  </div>
  <button className="mobile-edit-done" type="button" aria-label="Finish editing" onMouseDown={e=>e.preventDefault()} onClick={onDone}><Icon name="check" size={19}/></button>
 </div>;
}
